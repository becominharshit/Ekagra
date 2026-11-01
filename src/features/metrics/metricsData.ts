import type { PostgrestError } from '@supabase/supabase-js'
import { useQuery } from '@tanstack/react-query'
import { addDays, format } from 'date-fns'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Tables } from '@/types/database'
import { hasActivity, weekMetrics, weekStartOf, type MetricInputs, type WeekMetrics } from './metrics'

// The learning metrics over time: each finished week is saved once (metric_snapshots), so the
// Progress screen and the weekly challenge can compare weeks; this week is worked out live.
// Supabase or (Demo Mode) the device.

export type Snapshot = Tables<'metric_snapshots'>

export const metricsKey = (owner: string | null) => ['metrics', owner] as const

/** How many finished weeks are looked at for missing snapshots. */
const WEEKS_BACK = 8
const PAGE_SIZE = 1000
const MAX_PAGES = 50

/** All rows of a query, one page at a time. */
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>): Promise<T[]> {
  const rows: T[] = []
  for (let index = 0; index < MAX_PAGES; index++) {
    const from = index * PAGE_SIZE
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw dbError(error)
    rows.push(...(data ?? []))
    if ((data ?? []).length < PAGE_SIZE) break
  }
  return rows
}

const learnedWork = (block: { topic_id: string | null; actual_minutes: number | null; status: string }) =>
  block.topic_id !== null && (block.actual_minutes ?? 0) > 0 && (block.status === 'done' || block.status === 'partial')

/** What the metrics are worked out from: reviews and focus since `since`, all answers, learned topics, studied minutes. */
export async function loadMetricInputs(source: DataSource, since: Date): Promise<MetricInputs> {
  const after = since.toISOString()
  if (source.kind === 'demo') {
    return {
      reviews: demoDb.list('flashcard_reviews').filter((review) => review.reviewed_at >= after),
      attempts: demoDb.list('attempts'),
      questionDifficulty: new Map(demoDb.list('questions').map((question) => [question.id, question.difficulty])),
      topics: demoDb.list('topics').filter((topic) => topic.learned_at !== null),
      topicMinutes: demoDb
        .list('plan_blocks')
        .filter(learnedWork)
        .map((block) => ({ topic_id: block.topic_id ?? '', minutes: block.actual_minutes ?? 0, date: block.date })),
      focus: demoDb.list('focus_sessions').filter((session) => session.started_at >= after),
    }
  }
  const { client, userId } = source
  const [reviews, attempts, questions, topics, blocks, focus] = await Promise.all([
    readAll((from, to) => client.from('flashcard_reviews').select('rating, reviewed_at').eq('user_id', userId).gte('reviewed_at', after).order('id').range(from, to)),
    readAll((from, to) => client.from('attempts').select('question_id, is_correct, time_ms, created_at').eq('user_id', userId).order('id').range(from, to)),
    readAll((from, to) => client.from('questions').select('id, difficulty').eq('user_id', userId).order('id').range(from, to)),
    readAll((from, to) => client.from('topics').select('id, est_minutes, learned_at').eq('user_id', userId).not('learned_at', 'is', null).order('id').range(from, to)),
    readAll((from, to) =>
      client.from('plan_blocks').select('topic_id, actual_minutes, status, date').eq('user_id', userId).not('topic_id', 'is', null).in('status', ['done', 'partial']).order('id').range(from, to),
    ),
    readAll((from, to) => client.from('focus_sessions').select('started_at, actual_minutes').eq('user_id', userId).gte('started_at', after).order('id').range(from, to)),
  ])
  return {
    reviews,
    attempts,
    questionDifficulty: new Map(questions.map((question) => [question.id, question.difficulty])),
    topics,
    topicMinutes: blocks.filter(learnedWork).map((block) => ({ topic_id: block.topic_id ?? '', minutes: block.actual_minutes ?? 0, date: block.date })),
    focus,
  }
}

export async function listSnapshots(source: DataSource): Promise<Snapshot[]> {
  const byWeek = (a: Snapshot, b: Snapshot) => a.week_start.localeCompare(b.week_start)
  if (source.kind === 'demo') return demoDb.list('metric_snapshots').sort(byWeek)
  const { data, error } = await source.client.from('metric_snapshots').select('*').eq('user_id', source.userId).order('week_start')
  if (error) throw dbError(error)
  return data.sort(byWeek)
}

export async function saveSnapshot(source: DataSource, metrics: WeekMetrics): Promise<void> {
  const row = {
    week_start: metrics.weekStart,
    memory: metrics.memory,
    learning_speed: metrics.learningSpeed,
    processing_speed: metrics.processingSpeed,
    problem_solving: metrics.problemSolving,
    focus_minutes: metrics.focusMinutes,
    details: metrics.details,
  }
  if (source.kind === 'demo') {
    const existing = demoDb.list('metric_snapshots').find((snapshot) => snapshot.week_start === metrics.weekStart)
    if (existing) demoDb.update('metric_snapshots', existing.id, row)
    else demoDb.insert('metric_snapshots', [row])
    return
  }
  const { error } = await source.client.from('metric_snapshots').upsert({ ...row, user_id: source.userId }, { onConflict: 'user_id,week_start' })
  if (error) throw dbError(error)
}

export interface MetricsView {
  /** Finished weeks, oldest first. */
  snapshots: Snapshot[]
  /** This week so far (not saved until it's over). */
  thisWeek: WeekMetrics
}

/** Saves the snapshots missing for the last finished weeks (only weeks with some practice) and works out this week. */
export async function syncMetrics(source: DataSource, now = new Date()): Promise<MetricsView> {
  const thisWeekStart = weekStartOf(now)
  const [inputs, saved] = await Promise.all([loadMetricInputs(source, addDays(thisWeekStart, -7 * WEEKS_BACK)), listSnapshots(source)])
  const have = new Set(saved.map((snapshot) => snapshot.week_start))
  let added = false
  for (let weeksAgo = WEEKS_BACK; weeksAgo >= 1; weeksAgo--) {
    const week = addDays(thisWeekStart, -7 * weeksAgo)
    if (have.has(format(week, 'yyyy-MM-dd'))) continue
    const metrics = weekMetrics(inputs, week)
    if (!hasActivity(metrics)) continue
    await saveSnapshot(source, metrics)
    added = true
  }
  return { snapshots: added ? await listSnapshots(source) : saved, thisWeek: weekMetrics(inputs, thisWeekStart) }
}

export function useMetrics() {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: metricsKey(owner),
    queryFn: () => syncMetrics(need(source)),
    enabled: source !== null,
  })
}
