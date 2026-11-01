import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { leafTopics, type Question } from '@/features/academics/pastPapers'
import { loadRoadmap } from '@/features/academics/roadmap'
import { academicsKey } from '@/features/academics/subjects'
import type { StoredCheckQuestion } from '@/features/lessons/quiz'
import { metricsKey } from '@/features/metrics/metricsData'
import { noteMistake } from '@/features/mistakes/mistakes'
import { gradeAnswers, gradeOnDevice, type Grade } from '@/features/practice/grading'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Tables } from '@/types/database'
import { examPattern, mockPool, QUESTION_TYPES, type ExamPattern, type MockChoice, type MockQuestion, type MockTest, type PoolQuestion } from './pattern'
import { autoMark, gradeItems, markFromGrade, mockRows, type FinishedMock, type MockMark } from './scoring'

// Mock tests: what a test is made from, marking, saving, and the test in progress, which stays on
// this device (so leaving the screen or closing the app loses nothing) until it's saved.
// Supabase or (Demo Mode) the device.

export type MockQuiz = Tables<'quizzes'>

/** ai-grade marks at most this many answers per request. */
const GRADE_BATCH = 15
/** Questions used in this many recent mocks come later. */
const RECENT_MOCKS = 20

async function loadQuestions(source: DataSource, subjectId: string): Promise<Question[]> {
  if (source.kind === 'demo') return demoDb.list('questions').filter((row) => row.subject_id === subjectId && (row.source === 'pyq' || row.source === 'generated'))
  const { data, error } = await source.client.from('questions').select('*').eq('user_id', source.userId).eq('subject_id', subjectId).in('source', ['pyq', 'generated'])
  if (error) throw dbError(error)
  return data
}

/** The subject's finished mock tests, newest first. */
export async function listMocks(source: DataSource, subjectId: string): Promise<MockQuiz[]> {
  const newestFirst = (a: MockQuiz, b: MockQuiz) => Date.parse(b.started_at) - Date.parse(a.started_at)
  if (source.kind === 'demo') {
    return demoDb
      .list('quizzes')
      .filter((quiz) => quiz.kind === 'mock' && quiz.subject_id === subjectId && quiz.finished_at !== null)
      .sort(newestFirst)
  }
  const { data, error } = await source.client
    .from('quizzes')
    .select('*')
    .eq('user_id', source.userId)
    .eq('subject_id', subjectId)
    .eq('kind', 'mock')
    .not('finished_at', 'is', null)
    .order('started_at', { ascending: false })
  if (error) throw dbError(error)
  return data.sort(newestFirst)
}

export interface LatestMock {
  /** 0–1 */
  score: number
  startedAt: string
}

/** Each subject's latest finished mock test (for exam readiness). */
export async function latestMocks(source: DataSource): Promise<Map<string, LatestMock>> {
  let rows: Pick<MockQuiz, 'subject_id' | 'score' | 'started_at'>[]
  if (source.kind === 'demo') {
    rows = demoDb.list('quizzes').filter((quiz) => quiz.kind === 'mock' && quiz.finished_at !== null)
  } else {
    const { data, error } = await source.client
      .from('quizzes')
      .select('subject_id, score, started_at')
      .eq('user_id', source.userId)
      .eq('kind', 'mock')
      .not('finished_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(1000)
    if (error) throw dbError(error)
    rows = data
  }
  const latest = new Map<string, LatestMock>()
  for (const row of [...rows].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))) {
    if (row.subject_id && row.score !== null && !latest.has(row.subject_id)) latest.set(row.subject_id, { score: Number(row.score), startedAt: row.started_at })
  }
  return latest
}

export function useLatestMocks() {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'mock-latest'],
    queryFn: () => latestMocks(need(source)),
    enabled: source !== null,
  })
}

/** How many of these mocks each question was in. */
async function usedInMocks(source: DataSource, quizIds: string[]): Promise<Map<string, number>> {
  const used = new Map<string, number>()
  if (quizIds.length === 0) return used
  let rows: { question_id: string }[]
  if (source.kind === 'demo') {
    const ids = new Set(quizIds)
    rows = demoDb.list('attempts').filter((attempt) => attempt.quiz_id !== null && ids.has(attempt.quiz_id))
  } else {
    const { data, error } = await source.client.from('attempts').select('question_id').eq('user_id', source.userId).in('quiz_id', quizIds)
    if (error) throw dbError(error)
    rows = data
  }
  for (const row of rows) used.set(row.question_id, (used.get(row.question_id) ?? 0) + 1)
  return used
}

export interface MockSetup {
  /** From the past papers; null without any. */
  pattern: ExamPattern | null
  pool: PoolQuestion[]
  choice: MockChoice
  topicTitles: Map<string, string>
  /** Earlier mock tests of this subject, newest first. */
  mocks: MockQuiz[]
}

export async function loadMockSetup(source: DataSource, subjectId: string): Promise<MockSetup> {
  const [rows, roadmap, mocks] = await Promise.all([loadQuestions(source, subjectId), loadRoadmap(source, subjectId), listMocks(source, subjectId)])
  const used = await usedInMocks(
    source,
    mocks.slice(0, RECENT_MOCKS).map((quiz) => quiz.id),
  )
  const leaves = leafTopics(roadmap.topics)
  return {
    pattern: examPattern(rows.filter((row) => row.source === 'pyq')),
    pool: mockPool(rows),
    choice: {
      used,
      priority: new Map(leaves.map((topic) => [topic.id, Number(topic.priority_score)])),
      topicOrder: new Map(leaves.map((topic, index) => [topic.id, index])),
    },
    topicTitles: new Map(roadmap.topics.map((topic) => [topic.id, topic.title])),
    mocks,
  }
}

export function useMockSetup(subjectId: string) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'mock', subjectId],
    queryFn: () => loadMockSetup(need(source), subjectId),
    enabled: source !== null && subjectId !== '',
  })
}

/**
 * Marks a handed-in test. Multiple choice and numericals from lessons are marked by the app; the
 * written answers by ai-grade, 15 at a time. Where the AI can't (or in Demo Mode), the device gives
 * a rough mark (or none, for the student to give). Never fails: aiError says what went wrong.
 */
export async function markMock(
  source: DataSource,
  { subject, questions, answers }: { subject: string; questions: MockQuestion[]; answers: Readonly<Record<string, string>> },
): Promise<{ marks: Record<string, MockMark>; aiError: string | null }> {
  const marks: Record<string, MockMark> = {}
  for (const question of questions) {
    const mark = autoMark(question, answers[question.id] ?? '')
    if (mark) marks[question.id] = mark
  }
  const { items, idByKey } = gradeItems(questions, answers)
  const grades: Grade[] = []
  let aiError: string | null = null
  for (let start = 0; start < items.length; start += GRADE_BATCH) {
    const batch = items.slice(start, start + GRADE_BATCH)
    try {
      grades.push(...(await gradeAnswers(source, { subject: subject.trim().slice(0, 120) || 'Subject', items: batch })))
    } catch (error) {
      aiError ??= error instanceof Error ? error.message : 'The AI could not mark your answers.'
      grades.push(...batch.map(gradeOnDevice))
    }
  }
  for (const grade of grades) {
    const id = idByKey.get(grade.key)
    if (id) marks[id] = markFromGrade(grade)
  }
  // Anything left without a mark is marked on the device.
  for (const item of items) {
    const id = idByKey.get(item.key)
    if (id && !marks[id]) marks[id] = markFromGrade(gradeOnDevice(item))
  }
  return { marks, aiError }
}

/** Saves a finished, fully marked mock test. Saving again after a failure doesn't add anything twice. */
export async function saveMock(source: DataSource, mock: FinishedMock, now = new Date()): Promise<void> {
  const { quiz, attempts, mistakes } = mockRows(mock)
  if (source.kind === 'demo') {
    if (!demoDb.get('quizzes', mock.quizId)) demoDb.insert('quizzes', [quiz])
    demoDb.remove(
      'attempts',
      demoDb
        .list('attempts')
        .filter((attempt) => attempt.quiz_id === mock.quizId)
        .map((attempt) => attempt.id),
    )
    demoDb.insert('attempts', attempts)
  } else {
    const client = source.client
    const savedQuiz = await client.from('quizzes').upsert({ ...quiz, user_id: source.userId })
    if (savedQuiz.error) throw dbError(savedQuiz.error)
    const cleared = await client.from('attempts').delete().eq('quiz_id', mock.quizId)
    if (cleared.error) throw dbError(cleared.error)
    const savedAttempts = await client.from('attempts').insert(attempts)
    if (savedAttempts.error) throw dbError(savedAttempts.error)
  }
  for (const mistake of mistakes) await noteMistake(source, mistake, now)
}

/** After saving: the subject's mocks, the mistake notebook, readiness and the metrics reload. */
export function useSaveMock() {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (mock: FinishedMock) => saveMock(need(source), mock),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: academicsKey(owner) }), queryClient.invalidateQueries({ queryKey: metricsKey(owner) })])
    },
  })
}

// ---------------------------------------------------------------------------
// The test in progress, kept on this device
// ---------------------------------------------------------------------------

/** A type (not an interface) so it can be kept as JSON. */
export type MockProgress = {
  quizId: string
  subjectId: string
  startedAt: string
  minutes: number
  questions: MockQuestion[]
  answers: Record<string, string>
  /** Time spent on each question so far. */
  timeMs: Record<string, number>
  /** The question on screen. */
  current: number
  /** Set when handed in (or when the time ran out). */
  finishedAt: string | null
  /** Set once marked. */
  marks: Record<string, MockMark> | null
  /** Why the AI couldn't mark the written answers (the device marked them instead). */
  aiError: string | null
}

const checkBase = { id: z.string(), prompt: z.string(), explanation: z.string(), difficulty: z.number().nullable() }
const checkSchema: z.ZodType<StoredCheckQuestion> = z.discriminatedUnion('type', [
  z.object({ ...checkBase, type: z.literal('mcq'), options: z.array(z.string()), correct: z.number() }),
  z.object({ ...checkBase, type: z.literal('numerical'), value: z.number(), tolerance: z.number() }),
  z.object({ ...checkBase, type: z.literal('short'), model: z.string(), keyPoints: z.array(z.string()) }),
])
const questionSchema: z.ZodType<MockQuestion> = z.object({
  id: z.string(),
  topicId: z.string().nullable(),
  type: z.enum(QUESTION_TYPES),
  marks: z.number().positive(),
  prompt: z.string(),
  check: checkSchema.nullable(),
})
const markSchema: z.ZodType<MockMark> = z.object({
  awarded: z.number().min(0).nullable(),
  by: z.enum(['app', 'ai', 'device', 'self']),
  feedback: z.string().nullable(),
  missing: z.array(z.string()),
  modelAnswer: z.string().nullable(),
})
const progressSchema: z.ZodType<MockProgress> = z.object({
  quizId: z.string().min(1),
  subjectId: z.string().min(1),
  startedAt: z.iso.datetime(),
  minutes: z.number().positive(),
  questions: z.array(questionSchema).min(1),
  answers: z.record(z.string(), z.string()),
  timeMs: z.record(z.string(), z.number()),
  current: z.number().int().min(0),
  finishedAt: z.iso.datetime().nullable(),
  marks: z.record(z.string(), markSchema).nullable(),
  aiError: z.string().nullable(),
})

const progressKey = (owner: string, subjectId: string) => `ekagra-mock:${owner}:${subjectId}`

export function readProgress(owner: string, subjectId: string): MockProgress | null {
  try {
    const parsed = progressSchema.safeParse(JSON.parse(localStorage.getItem(progressKey(owner, subjectId)) ?? 'null'))
    return parsed.success && parsed.data.subjectId === subjectId ? parsed.data : null
  } catch {
    return null
  }
}

/** Keeps the test on the device; null forgets it. */
export function keepProgress(owner: string, subjectId: string, progress: MockProgress | null): void {
  try {
    if (progress) localStorage.setItem(progressKey(owner, subjectId), JSON.stringify(progress))
    else localStorage.removeItem(progressKey(owner, subjectId))
  } catch {
    // Storage is full or blocked: the test still works, it just can't be resumed later.
  }
}

/** The mock test in progress for a subject: read from the device once, kept there on every change. */
export function useMockProgress(owner: string, subjectId: string) {
  const [progress, setProgress] = useState<MockProgress | null>(() => readProgress(owner, subjectId))
  useEffect(() => {
    keepProgress(owner, subjectId, progress)
  }, [owner, subjectId, progress])
  return [progress, setProgress] as const
}

/** A new test in progress, starting now. */
export function newProgress(subjectId: string, test: Pick<MockTest, 'questions' | 'minutes'>, now = new Date()): MockProgress {
  return {
    quizId: crypto.randomUUID(),
    subjectId,
    startedAt: now.toISOString(),
    minutes: test.minutes,
    questions: test.questions,
    answers: {},
    timeMs: {},
    current: 0,
    finishedAt: null,
    marks: null,
    aiError: null,
  }
}

/** A handed-in test whose answers all have marks, ready to save; otherwise null. */
export function finishedMock(progress: MockProgress): FinishedMock | null {
  const { finishedAt, marks } = progress
  if (!finishedAt || !marks || progress.questions.some((question) => marks[question.id]?.awarded == null)) return null
  return { ...progress, finishedAt, marks }
}
