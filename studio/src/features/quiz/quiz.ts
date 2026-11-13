import { useQuery } from '@tanstack/react-query'
import { QUIZ_TEXT_LENGTH, StudioQuizResponseSchema } from '@shared/schemas.ts'
import { academicsKey } from '@/features/academics/subjects'
import { callAiFunction } from '@/features/ai/aiClient'
import type { QuizAnswer } from '@/features/lessons/lessons'
import { givenText, readCheckQuestion, rightAnswerText, type StoredCheckQuestion } from '@/features/lessons/quiz'
import { noteMistake } from '@/features/mistakes/mistakes'
import type { Note } from '@/features/notes/notes'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Tables, TablesInsert } from '@/types/database'

// Quizzes in Ekagra Studio: multiple-choice questions from a note (studio-quiz). They are saved the way
// Ekagra saves its own (src/features/lessons/quiz.ts: questions with type "mcq", options and
// answer { correct }), with source_ref { kind: "studio", noteId }, so Ekagra's lesson check quizzes
// and practice never mix them in. The answers go into quizzes and attempts, and wrong ones into the
// mistake notebook, so Ekagra's progress, weekly review and notebook count them.

type Question = Tables<'questions'>

/** A question made in Studio from this note. */
export function isNoteQuestion(row: Pick<Question, 'source' | 'source_ref'>, noteId: string): boolean {
  const ref = row.source_ref
  return row.source === 'generated' && typeof ref === 'object' && ref !== null && !Array.isArray(ref) && ref.kind === 'studio' && ref.noteId === noteId
}

/** The questions already made from this note, ready to ask again (broken rows are skipped). */
export async function noteQuestions(source: DataSource, noteId: string): Promise<StoredCheckQuestion[]> {
  let rows: Question[]
  if (source.kind === 'demo') rows = demoDb.list('questions').filter((row) => isNoteQuestion(row, noteId))
  else {
    const { data, error } = await source.client
      .from('questions')
      .select('*')
      .eq('user_id', source.userId)
      .eq('source', 'generated')
      .contains('source_ref', { kind: 'studio', noteId })
      .order('created_at')
    if (error) throw dbError(error)
    rows = data
  }
  return rows.flatMap((row) => readCheckQuestion(row) ?? [])
}

export interface MakeQuizInput {
  note: Pick<Note, 'id' | 'title' | 'content' | 'subject_id' | 'topic_id'>
  count: number
  program?: string | null
  year?: number | null
  videoId?: string | null
}

/** New questions from the note (Gemini), saved, and returned ready to ask. */
export async function makeQuiz(source: DataSource, { note, count, program, year, videoId }: MakeQuizInput): Promise<StoredCheckQuestion[]> {
  if (source.kind === 'demo') throw new Error("Studio's AI needs you to be signed in.")
  if (!note.content.trim()) throw new Error('This note is empty: there is nothing to ask about.')
  const answer = await callAiFunction(
    'studio-quiz',
    {
      noteId: note.id,
      title: note.title.slice(0, 200),
      text: note.content.slice(0, QUIZ_TEXT_LENGTH),
      count,
      program: program ?? null,
      year: year ?? null,
      ...(videoId ? { videoId } : {}),
    },
    StudioQuizResponseSchema,
  )
  const rows: TablesInsert<'questions'>[] = answer.questions.map((question) => ({
    id: crypto.randomUUID(),
    source: 'generated',
    source_ref: { kind: 'studio', noteId: note.id },
    subject_id: note.subject_id,
    topic_id: note.topic_id,
    type: 'mcq',
    prompt: question.prompt,
    options: question.options,
    answer: { correct: question.correctOption },
    explanation: question.explanation,
    difficulty: question.difficulty,
    prompt_version: answer.promptVersion,
  }))
  const { error } = await source.client.from('questions').insert(rows)
  if (error) throw dbError(error)
  return answer.questions.map((question, index) => ({
    id: rows[index]?.id ?? '',
    type: 'mcq',
    prompt: question.prompt,
    options: question.options,
    correct: question.correctOption,
    explanation: question.explanation,
    difficulty: question.difficulty,
  }))
}

/** The notebook entry for a wrong answer (like Ekagra's, but the note may have no topic). */
export function studioMistake(question: StoredCheckQuestion, given: string, topicId: string | null): TablesInsert<'mistakes'> {
  return {
    concept: question.prompt.slice(0, 1000),
    why_wrong: `I answered: ${givenText(question, given)}`,
    correct_approach: [rightAnswerText(question), question.explanation].filter(Boolean).join('\n\n'),
    topic_id: topicId,
    question_id: question.id,
  }
}

/** Saves a finished quiz: the quiz, one attempt per question and a notebook entry per wrong answer. Returns the score (0–1). */
export async function saveQuizResult(
  source: DataSource,
  { note, answers, startedAt, now = new Date() }: { note: Pick<Note, 'subject_id' | 'topic_id'>; answers: QuizAnswer[]; startedAt: Date; now?: Date },
): Promise<number> {
  const score = answers.length > 0 ? Math.round((answers.filter((answer) => answer.right).length / answers.length) * 10_000) / 10_000 : 0
  const quizId = crypto.randomUUID()
  const quiz: TablesInsert<'quizzes'> = {
    id: quizId,
    // A note about one topic is a topic quiz; otherwise it covers the subject.
    kind: note.topic_id ? 'topic' : 'subject',
    subject_id: note.subject_id,
    topic_ids: note.topic_id ? [note.topic_id] : [],
    started_at: startedAt.toISOString(),
    finished_at: now.toISOString(),
    score,
  }
  const attempts: TablesInsert<'attempts'>[] = answers.map((answer) => ({
    question_id: answer.question.id,
    quiz_id: quizId,
    answer: { given: answer.given },
    is_correct: answer.right,
    score: answer.right ? 1 : 0,
    time_ms: Math.max(0, Math.round(answer.timeMs)),
  }))
  if (source.kind === 'demo') {
    demoDb.insert('quizzes', [quiz])
    demoDb.insert('attempts', attempts)
  } else {
    const savedQuiz = await source.client.from('quizzes').insert(quiz)
    if (savedQuiz.error) throw dbError(savedQuiz.error)
    const savedAttempts = await source.client.from('attempts').insert(attempts)
    if (savedAttempts.error) throw dbError(savedAttempts.error)
  }
  for (const answer of answers) {
    if (!answer.right) await noteMistake(source, studioMistake(answer.question, answer.given, note.topic_id), now)
  }
  return score
}

export function useNoteQuestions(noteId: string) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'note-questions', noteId],
    queryFn: () => noteQuestions(need(source), noteId),
    enabled: source !== null,
  })
}
