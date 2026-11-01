import type { GradeItem } from '@shared/schemas.ts'
import { isRight, mistakeForAnswer, rightAnswerText } from '@/features/lessons/quiz'
import type { Grade } from '@/features/practice/grading'
import type { TablesInsert } from '@/types/database'
import { isAutoMarked, type MockQuestion } from './pattern'

// Marking a mock test and what it saves. Multiple choice and numericals from lessons are marked by
// the app; every other answer is a written answer, marked by ai-grade (or roughly on the device,
// or by the student). Half marks or more count as right; less goes to the mistake notebook.
// Pure functions, tested on their own.

export type MarkedBy = 'app' | 'ai' | 'device' | 'self'

/** The mark of one answer. A type (not an interface) so it can be saved as JSON. */
export type MockMark = {
  /** null = the student still has to mark it. */
  awarded: number | null
  by: MarkedBy
  feedback: string | null
  missing: string[]
  /** The right answer, or a full-marks answer when known. */
  modelAnswer: string | null
}

/** From this share of a question's marks, the answer counts as right. */
export const PASS_SHARE = 0.5

const round4 = (value: number) => Math.round(value * 10_000) / 10_000

/** 2 → "2", 2.5 → "2.5" */
export const marksText = (marks: number) => (Number.isInteger(marks) ? String(marks) : marks.toFixed(1))

/** Multiple choice and numericals from lessons: full marks or none. Null for written answers. */
export function autoMark(question: MockQuestion, given: string): MockMark | null {
  const check = question.check
  if (!check || !isAutoMarked(question)) return null
  // An empty answer is never right (Number('') would be option 0).
  const right = given.trim() !== '' && isRight(check, given)
  return { awarded: right ? question.marks : 0, by: 'app', feedback: check.explanation || null, missing: [], modelAnswer: rightAnswerText(check) }
}

/** The written answers in the shape ai-grade takes, with keys a1, a2, … by question number. */
export function gradeItems(questions: MockQuestion[], answers: Readonly<Record<string, string>>): { items: GradeItem[]; idByKey: Map<string, string> } {
  const items: GradeItem[] = []
  const idByKey = new Map<string, string>()
  questions.forEach((question, index) => {
    if (isAutoMarked(question)) return
    const key = `a${index + 1}`
    const lesson = question.check?.type === 'short' ? question.check : null
    items.push({
      key,
      question: question.prompt.slice(0, 4000),
      marks: Math.min(100, Math.max(0.5, question.marks)),
      answer: (answers[question.id] ?? '').slice(0, 8000),
      ...(lesson && lesson.keyPoints.length > 0 ? { keyPoints: lesson.keyPoints.slice(0, 12).map((point) => point.slice(0, 300)) } : {}),
      ...(lesson ? { modelAnswer: lesson.model.slice(0, 4000) } : {}),
    })
    idByKey.set(key, question.id)
  })
  return { items, idByKey }
}

export function markFromGrade(grade: Grade): MockMark {
  return { awarded: grade.awarded, by: grade.by, feedback: grade.feedback || null, missing: grade.missing, modelAnswer: grade.modelAnswer }
}

export interface MockScore {
  awarded: number
  total: number
  /** 0–1 */
  share: number
  /** Answers the student still has to mark. */
  unmarked: number
}

export function scoreMock(questions: MockQuestion[], marks: Readonly<Record<string, MockMark>>): MockScore {
  let awarded = 0
  let total = 0
  let unmarked = 0
  for (const question of questions) {
    total += question.marks
    const mark = marks[question.id]
    if (!mark || mark.awarded === null) unmarked += 1
    else awarded += mark.awarded
  }
  return { awarded, total, share: total > 0 ? awarded / total : 0, unmarked }
}

export interface TopicResult {
  /** null = questions not matched to a topic. */
  topicId: string | null
  awarded: number
  marks: number
}

/** Marks per topic, weakest first (answers not marked yet count as 0). */
export function topicBreakdown(questions: MockQuestion[], marks: Readonly<Record<string, MockMark>>): TopicResult[] {
  const byTopic = new Map<string | null, TopicResult>()
  for (const question of questions) {
    const row = byTopic.get(question.topicId) ?? { topicId: question.topicId, awarded: 0, marks: 0 }
    row.marks += question.marks
    row.awarded += marks[question.id]?.awarded ?? 0
    byTopic.set(question.topicId, row)
  }
  const share = (row: TopicResult) => (row.marks > 0 ? row.awarded / row.marks : 0)
  return [...byTopic.values()].sort((a, b) => share(a) - share(b) || b.marks - a.marks)
}

/** A finished, fully marked mock test. */
export interface FinishedMock {
  quizId: string
  subjectId: string
  startedAt: string
  finishedAt: string
  minutes: number
  questions: MockQuestion[]
  answers: Readonly<Record<string, string>>
  marks: Readonly<Record<string, MockMark>>
  /** Time spent on each question. */
  timeMs: Readonly<Record<string, number>>
}

function mistakeFor(question: MockQuestion, given: string, mark: MockMark): TablesInsert<'mistakes'> {
  const leftOut = !given.trim()
  if (question.check && isAutoMarked(question)) {
    const entry = { ...mistakeForAnswer(question.check, given, question.topicId ?? ''), topic_id: question.topicId }
    return leftOut ? { ...entry, why_wrong: 'I left it out in a mock test.' } : entry
  }
  return {
    concept: question.prompt.slice(0, 1000),
    why_wrong: leftOut
      ? `I left it out in a mock test (${marksText(question.marks)} marks).`
      : `In a mock test I got ${marksText(mark.awarded ?? 0)} of ${marksText(question.marks)} marks.${mark.feedback ? ` ${mark.feedback}` : ''}`,
    correct_approach: [mark.modelAnswer, mark.missing.length > 0 ? `Points to include: ${mark.missing.join('; ')}` : null].filter(Boolean).join('\n\n') || null,
    topic_id: question.topicId,
    question_id: question.id,
  }
}

/** What a finished mock test saves: the quiz, one attempt per question and the notebook entries. */
export function mockRows(mock: FinishedMock): { quiz: TablesInsert<'quizzes'>; attempts: TablesInsert<'attempts'>[]; mistakes: TablesInsert<'mistakes'>[] } {
  const quiz: TablesInsert<'quizzes'> = {
    id: mock.quizId,
    kind: 'mock',
    subject_id: mock.subjectId,
    topic_ids: [...new Set(mock.questions.flatMap((question) => (question.topicId ? [question.topicId] : [])))],
    started_at: mock.startedAt,
    finished_at: mock.finishedAt,
    time_limit_sec: Math.round(mock.minutes * 60),
    score: round4(scoreMock(mock.questions, mock.marks).share),
  }
  const attempts: TablesInsert<'attempts'>[] = []
  const mistakes: TablesInsert<'mistakes'>[] = []
  for (const question of mock.questions) {
    const mark: MockMark = mock.marks[question.id] ?? { awarded: 0, by: 'self', feedback: null, missing: [], modelAnswer: null }
    const awarded = mark.awarded ?? 0
    const share = question.marks > 0 ? awarded / question.marks : 0
    const given = mock.answers[question.id] ?? ''
    const timeMs = Math.max(0, Math.round(mock.timeMs[question.id] ?? 0))
    attempts.push({
      question_id: question.id,
      quiz_id: mock.quizId,
      answer: { given, awarded, marks: question.marks, by: mark.by, feedback: mark.feedback, missing: mark.missing, modelAnswer: mark.modelAnswer, timeMs },
      is_correct: share >= PASS_SHARE,
      score: round4(share),
      // Only quick answers count for the processing-speed metric: writing time would drown it.
      time_ms: isAutoMarked(question) && timeMs > 0 ? timeMs : null,
    })
    if (share < PASS_SHARE) mistakes.push(mistakeFor(question, given, mark))
  }
  return { quiz, attempts, mistakes }
}
