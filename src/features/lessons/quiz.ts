import { z } from 'zod'
import type { CheckQuestion as GeneratedQuestion } from '@shared/schemas.ts'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'

// Check quizzes: the 3–5 questions after a lesson. Plain functions, tested on their own.
// In the database a check question is a row of questions (source "generated", source_ref
// { kind: "check" }) with its right answer in questions.answer:
//   mcq        options = ["…", "…"], answer = { correct: 1 }
//   numerical  answer = { value: 3, tolerance: 0 }
//   short      answer = { model: "…", keyPoints: ["…"] }   (the student marks it himself)

type Question = Tables<'questions'>
type Topic = Tables<'topics'>

export type StoredCheckQuestion = {
  id: string
  prompt: string
  explanation: string
  difficulty: number | null
} & (
  | { type: 'mcq'; options: string[]; correct: number }
  | { type: 'numerical'; value: number; tolerance: number }
  | { type: 'short'; model: string; keyPoints: string[] }
)

/** A topic counts as learned (status "review") from this check-quiz score on. */
export const LEARNED_SCORE = 0.8

/** "3.5", "3,5", " 42 ", "-1e3" → a number; anything else → null. */
export function parseNumber(text: string): number | null {
  const cleaned = text.trim().replace(/\s/g, '').replace(',', '.')
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

/** The question rows to save for a topic's new check quiz. */
export function checkQuestionRows(
  questions: GeneratedQuestion[],
  topic: Pick<Topic, 'id' | 'subject_id'>,
  promptVersion: string,
): TablesInsert<'questions'>[] {
  return questions.map((question) => {
    const base = {
      source: 'generated',
      source_ref: { kind: 'check' },
      topic_id: topic.id,
      subject_id: topic.subject_id,
      type: question.type,
      prompt: question.prompt,
      explanation: question.explanation,
      difficulty: question.difficulty,
      prompt_version: promptVersion,
    }
    if (question.type === 'mcq') return { ...base, options: question.options, answer: { correct: question.correctOption ?? 0 } }
    if (question.type === 'numerical') {
      return { ...base, answer: { value: parseNumber(question.answer) ?? 0, tolerance: question.tolerance ?? 0 } }
    }
    return { ...base, answer: { model: question.answer, keyPoints: question.keyPoints } }
  })
}

const mcqAnswer = z.object({ correct: z.number().int().min(0) })
const numericalAnswer = z.object({ value: z.number(), tolerance: z.number().min(0) })
const shortAnswer = z.object({ model: z.string(), keyPoints: z.array(z.string()) })
const options = z.array(z.string()).min(2)

/** Is this row one of a topic's check questions? */
export function isCheckQuestion(row: Pick<Question, 'source' | 'source_ref'>): boolean {
  const ref = row.source_ref
  return row.source === 'generated' && typeof ref === 'object' && ref !== null && !Array.isArray(ref) && ref.kind === 'check'
}

/** A saved check question, ready to ask. Broken rows give null (they are skipped). */
export function readCheckQuestion(row: Question): StoredCheckQuestion | null {
  const base = { id: row.id, prompt: row.prompt, explanation: row.explanation ?? '', difficulty: row.difficulty }
  if (row.type === 'mcq') {
    const answer = mcqAnswer.safeParse(row.answer)
    const choices = options.safeParse(row.options)
    if (!answer.success || !choices.success || answer.data.correct >= choices.data.length) return null
    return { ...base, type: 'mcq', options: choices.data, correct: answer.data.correct }
  }
  if (row.type === 'numerical') {
    const answer = numericalAnswer.safeParse(row.answer)
    return answer.success ? { ...base, type: 'numerical', value: answer.data.value, tolerance: answer.data.tolerance } : null
  }
  if (row.type === 'short') {
    const answer = shortAnswer.safeParse(row.answer)
    return answer.success ? { ...base, type: 'short', model: answer.data.model, keyPoints: answer.data.keyPoints } : null
  }
  return null
}

/**
 * Checks an answer: mcq gets the index of the chosen option, numerical the typed text.
 * Short answers are marked by the student, so they never come here.
 */
export function isRight(question: StoredCheckQuestion, given: string): boolean {
  if (question.type === 'mcq') return Number(given) === question.correct
  if (question.type === 'numerical') {
    const value = parseNumber(given)
    // A little room for rounding even when the AI said 0, e.g. 0.333 for 1/3.
    const room = Math.max(question.tolerance, Math.abs(question.value) * 1e-6, 1e-9)
    return value !== null && Math.abs(value - question.value) <= room
  }
  return false
}

/** The right answer, in words. */
export function rightAnswerText(question: StoredCheckQuestion): string {
  if (question.type === 'mcq') return question.options[question.correct] ?? ''
  if (question.type === 'numerical') return String(question.value)
  return question.model
}

/** What the student answered, in words. */
export function givenText(question: StoredCheckQuestion, given: string): string {
  if (question.type === 'mcq') return question.options[Number(given)] ?? '(no answer)'
  return given.trim() || '(no answer)'
}

/**
 * Mastery is the latest check-quiz score; from 80% the topic counts as learned and leaves the plan.
 * The first time it's learned is kept (learned_at), for the "learning speed" metric.
 */
export function topicAfterQuiz(topic: Pick<Topic, 'status'> & { learned_at?: string | null }, score: number, now = new Date()): TablesUpdate<'topics'> {
  const mastery = Math.round(Math.min(1, Math.max(0, score)) * 1000) / 1000
  const learned = score >= LEARNED_SCORE
  const firstTime = learned && !topic.learned_at ? { learned_at: now.toISOString() } : {}
  if (topic.status === 'mastered') return { mastery, ...firstTime }
  return { mastery, status: learned ? 'review' : 'learning', ...firstTime }
}

/** The notebook entry for a wrong answer. */
export function mistakeForAnswer(question: StoredCheckQuestion, given: string, topicId: string): TablesInsert<'mistakes'> {
  const right = question.type === 'short' ? `${question.model}${question.keyPoints.length > 0 ? `\n\nKey points: ${question.keyPoints.join('; ')}` : ''}` : rightAnswerText(question)
  return {
    concept: question.prompt.slice(0, 1000),
    why_wrong: question.type === 'short' && !given.trim() ? 'I marked my answer as wrong.' : `I answered: ${givenText(question, given)}`,
    correct_approach: [right, question.explanation].filter(Boolean).join('\n\n'),
    topic_id: topicId,
    question_id: question.id,
  }
}
