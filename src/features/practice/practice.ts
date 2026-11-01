import { useQuery, useQueryClient } from '@tanstack/react-query'
import { academicsKey } from '@/features/academics/subjects'
import { isCheckQuestion, mistakeForAnswer, readCheckQuestion, type StoredCheckQuestion } from '@/features/lessons/quiz'
import { noteMistake } from '@/features/mistakes/mistakes'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Tables, TablesInsert } from '@/types/database'
import { questionRating, rateAnswer, START_RATING } from './elo'

// Adaptive practice for one subject: its check questions (the ones the app can mark), the student's
// Elo rating there and when each question was last answered. Every answer is saved right away: the
// attempt, both new ratings and, when wrong, a mistake-notebook entry. Supabase or Demo Mode.

export type PracticeQuestion = StoredCheckQuestion & {
  topicId: string | null
  /** The question's Elo rating (null until it was first answered). */
  rating: number | null
}

export interface PracticeData {
  questions: PracticeQuestion[]
  /** The student's rating in this subject and how many answers it is based on. */
  rating: number
  answers: number
  /** When each question was last answered (epoch ms). */
  lastAnswered: Map<string, number>
}

/** Practice sessions save their answers under a quiz of this kind. */
const QUIZ_KIND = 'subject'
const CHUNK = 100

function toPractice(rows: Tables<'questions'>[]): PracticeQuestion[] {
  return rows.filter(isCheckQuestion).flatMap((row) => {
    const question = readCheckQuestion(row)
    return question ? [{ ...question, topicId: row.topic_id, rating: row.rating }] : []
  })
}

function latest(attempts: Pick<Tables<'attempts'>, 'question_id' | 'created_at'>[]): Map<string, number> {
  const last = new Map<string, number>()
  for (const attempt of attempts) {
    const at = Date.parse(attempt.created_at)
    if (at > (last.get(attempt.question_id) ?? 0)) last.set(attempt.question_id, at)
  }
  return last
}

export async function loadPractice(source: DataSource, subjectId: string): Promise<PracticeData> {
  if (source.kind === 'demo') {
    const questions = toPractice(demoDb.list('questions').filter((row) => row.subject_id === subjectId))
    const ids = new Set(questions.map((question) => question.id))
    const rating = demoDb.list('subject_ratings').find((row) => row.subject_id === subjectId)
    return {
      questions,
      rating: rating ? Number(rating.rating) : START_RATING,
      answers: rating?.attempts_count ?? 0,
      lastAnswered: latest(demoDb.list('attempts').filter((attempt) => ids.has(attempt.question_id))),
    }
  }
  const client = source.client
  const [rows, rating] = await Promise.all([
    client.from('questions').select('*').eq('user_id', source.userId).eq('subject_id', subjectId).eq('source', 'generated'),
    client.from('subject_ratings').select('*').eq('user_id', source.userId).eq('subject_id', subjectId).maybeSingle(),
  ])
  if (rows.error) throw dbError(rows.error)
  if (rating.error) throw dbError(rating.error)
  const questions = toPractice(rows.data)
  const attempts: Pick<Tables<'attempts'>, 'question_id' | 'created_at'>[] = []
  for (let start = 0; start < questions.length; start += CHUNK) {
    const ids = questions.slice(start, start + CHUNK).map((question) => question.id)
    const { data, error } = await client.from('attempts').select('question_id, created_at').eq('user_id', source.userId).in('question_id', ids)
    if (error) throw dbError(error)
    attempts.push(...data)
  }
  return {
    questions,
    rating: rating.data ? Number(rating.data.rating) : START_RATING,
    answers: rating.data?.attempts_count ?? 0,
    lastAnswered: latest(attempts),
  }
}

export interface PracticeAnswer {
  subjectId: string
  /** The session's quiz id (made by the app, saved with the first answer). */
  quizId: string
  firstAnswer: boolean
  startedAt: Date
  question: PracticeQuestion
  /** mcq: the chosen option's index; numerical: the typed number; short: what the student wrote. */
  given: string
  right: boolean
  timeMs: number
  /** The student's rating and answer count before this answer. */
  rating: number
  answers: number
  now?: Date
}

/** Saves one answer; returns the student's and the question's new ratings. */
export async function savePracticeAnswer(source: DataSource, answer: PracticeAnswer): Promise<{ rating: number; questionRating: number }> {
  const { subjectId, quizId, question, right, now = new Date() } = answer
  const next = rateAnswer({ student: answer.rating, question: questionRating(question), answers: answer.answers, right })
  const quiz: TablesInsert<'quizzes'> = { id: quizId, kind: QUIZ_KIND, subject_id: subjectId, topic_ids: [], started_at: answer.startedAt.toISOString() }
  const attempt: TablesInsert<'attempts'> = {
    question_id: question.id,
    quiz_id: quizId,
    answer: { given: answer.given },
    is_correct: right,
    score: right ? 1 : 0,
    time_ms: Math.max(0, Math.round(answer.timeMs)),
  }
  const rating = { subject_id: subjectId, rating: next.student, attempts_count: answer.answers + 1 }

  if (source.kind === 'demo') {
    if (answer.firstAnswer) demoDb.insert('quizzes', [quiz])
    demoDb.insert('attempts', [attempt])
    demoDb.update('questions', question.id, { rating: next.question })
    const saved = demoDb.list('subject_ratings').find((row) => row.subject_id === subjectId)
    if (saved) demoDb.update('subject_ratings', saved.id, rating)
    else demoDb.insert('subject_ratings', [rating])
  } else {
    const client = source.client
    if (answer.firstAnswer) {
      const savedQuiz = await client.from('quizzes').insert(quiz)
      if (savedQuiz.error) throw dbError(savedQuiz.error)
    }
    const savedAttempt = await client.from('attempts').insert(attempt)
    if (savedAttempt.error) throw dbError(savedAttempt.error)
    const savedQuestion = await client.from('questions').update({ rating: next.question }).eq('id', question.id)
    if (savedQuestion.error) throw dbError(savedQuestion.error)
    const savedRating = await client.from('subject_ratings').upsert({ ...rating, user_id: source.userId }, { onConflict: 'user_id,subject_id' })
    if (savedRating.error) throw dbError(savedRating.error)
  }
  if (!right && question.topicId) await noteMistake(source, mistakeForAnswer(question, answer.given, question.topicId), now)
  return { rating: next.student, questionRating: next.question }
}

/** Closes a session with its score (share right, 0–1). */
export async function finishPractice(source: DataSource, { quizId, score, now = new Date() }: { quizId: string; score: number; now?: Date }): Promise<void> {
  const patch = { finished_at: now.toISOString(), score: Math.round(score * 10_000) / 10_000 }
  if (source.kind === 'demo') {
    if (demoDb.get('quizzes', quizId)) demoDb.update('quizzes', quizId, patch)
    return
  }
  const { error } = await source.client.from('quizzes').update(patch).eq('id', quizId)
  if (error) throw dbError(error)
}

export const practiceKey = (owner: string | null, subjectId: string | undefined) => [...academicsKey(owner), 'practice', subjectId] as const

export function usePractice(subjectId: string | undefined) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: practiceKey(owner, subjectId),
    queryFn: () => loadPractice(need(source), subjectId ?? ''),
    enabled: source !== null && Boolean(subjectId),
    // A session keeps its own state; reloading in the middle would change the questions.
    staleTime: Number.POSITIVE_INFINITY,
  })
}

/** After a session: the notebook, the subject's rating and the other Academics screens reload. */
export function useAfterPractice() {
  const { owner } = useDataSource()
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: academicsKey(owner) })
}
