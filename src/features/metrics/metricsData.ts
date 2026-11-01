import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, format } from 'date-fns'
import { dbError, need, readAll, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Tables, TablesUpdate } from '@/types/database'
import { isOnTarget, planChallenge, startTarget, type ChallengeWeek } from './challenge'
import { hasActivity, snapshotValues, toMetric, weekMetrics, weekStartOf, type Metric, type MetricInputs, type WeekMetrics } from './metrics'

// The learning metrics over time: each finished week is saved once (metric_snapshots), so the
// Progress screen and the weekly challenge (challenges, one per week) can compare weeks; this
// week is worked out live. Supabase or (Demo Mode) the device.

export type Snapshot = Tables<'metric_snapshots'>

export const metricsKey = (owner: string | null) => ['metrics', owner] as const

/** How many finished weeks are looked at for missing snapshots. */
const WEEKS_BACK = 8

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

export type ChallengeRow = Tables<'challenges'>

export async function listChallenges(source: DataSource): Promise<ChallengeRow[]> {
  const byWeek = (a: ChallengeRow, b: ChallengeRow) => a.week_start.localeCompare(b.week_start)
  if (source.kind === 'demo') return demoDb.list('challenges').sort(byWeek)
  const { data, error } = await source.client.from('challenges').select('*').eq('user_id', source.userId).order('week_start')
  if (error) throw dbError(error)
  return data.sort(byWeek)
}

async function updateChallenge(source: DataSource, id: string, patch: TablesUpdate<'challenges'>): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.update('challenges', id, patch)
    return
  }
  const { error } = await source.client.from('challenges').update(patch).eq('id', id)
  if (error) throw dbError(error)
}

/** Adds this week's challenge (one per week: if another device just added it, that one stays). */
async function addChallenge(source: DataSource, row: { week_start: string; metric: Metric; baseline: number | null; target: number }): Promise<void> {
  if (source.kind === 'demo') {
    if (!demoDb.list('challenges').some((challenge) => challenge.week_start === row.week_start)) demoDb.insert('challenges', [row])
    return
  }
  const { error } = await source.client.from('challenges').upsert({ ...row, user_id: source.userId }, { onConflict: 'user_id,week_start', ignoreDuplicates: true })
  if (error) throw dbError(error)
}

/**
 * Settles the challenges of finished weeks (on target or not, from their snapshot; no snapshot =
 * no practice = missed) and sets this week's when there's none yet.
 */
export async function syncChallenges(source: DataSource, snapshots: Snapshot[], thisWeek: string): Promise<{ challenge: ChallengeRow | null; challenges: ChallengeRow[] }> {
  const measured = new Map(snapshots.map((snapshot) => [snapshot.week_start, snapshotValues(snapshot)]))
  const saved = await listChallenges(source)
  let changed = false
  const settled: ChallengeRow[] = []
  for (const row of saved) {
    if (row.achieved !== null || row.week_start >= thisWeek) {
      settled.push(row)
      continue
    }
    const metric = toMetric(row.metric)
    const achieved = isOnTarget(metric, measured.get(row.week_start)?.[metric] ?? null, Number(row.target))
    await updateChallenge(source, row.id, { achieved })
    settled.push({ ...row, achieved })
    changed = true
  }
  if (!settled.some((row) => row.week_start === thisWeek)) {
    const finished: ChallengeWeek[] = settled.map((row) => {
      const metric = toMetric(row.metric)
      return { metric, target: Number(row.target), achieved: row.achieved, value: measured.get(row.week_start)?.[metric] ?? null }
    })
    const latest = snapshots[snapshots.length - 1]
    const plan = planChallenge(finished, latest ? snapshotValues(latest) : null)
    if (plan) {
      await addChallenge(source, { week_start: thisWeek, ...plan })
      changed = true
    }
  }
  const rows = changed ? await listChallenges(source) : settled
  return { challenge: rows.find((row) => row.week_start === thisWeek) ?? null, challenges: rows.filter((row) => row.week_start < thisWeek) }
}

export interface MetricsView {
  /** Finished weeks, oldest first. */
  snapshots: Snapshot[]
  /** This week so far (not saved until it's over). */
  thisWeek: WeekMetrics
  /** This week's challenge; null while nothing could be measured yet. */
  challenge: ChallengeRow | null
  /** Earlier challenges, oldest first. */
  challenges: ChallengeRow[]
}

/**
 * Saves the snapshots missing for the last finished weeks (only weeks with some practice), works
 * out this week, then settles and sets the weekly challenge (in that order, so a challenge is only
 * judged once its week is saved).
 */
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
  const snapshots = added ? await listSnapshots(source) : saved
  const thisWeek = weekMetrics(inputs, thisWeekStart)
  return { snapshots, thisWeek, ...(await syncChallenges(source, snapshots, thisWeek.weekStart)) }
}

export function useMetrics() {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: metricsKey(owner),
    queryFn: () => syncMetrics(need(source)),
    enabled: source !== null,
  })
}

/**
 * Picks a coming week's challenge (from the weekly review): the metric, with a target 5% better
 * than its last value. A challenge already set for that week is changed unless it's settled.
 */
export async function setWeekChallenge(source: DataSource, { weekStart, metric, baseline }: { weekStart: string; metric: Metric; baseline: number }): Promise<void> {
  const row = { week_start: weekStart, metric, baseline, target: startTarget(metric, baseline) }
  if (source.kind === 'demo') {
    const existing = demoDb.list('challenges').find((challenge) => challenge.week_start === weekStart)
    if (!existing) demoDb.insert('challenges', [row])
    else if (existing.achieved === null) demoDb.update('challenges', existing.id, row)
    return
  }
  const { data, error } = await source.client.from('challenges').select('id, achieved').eq('user_id', source.userId).eq('week_start', weekStart).maybeSingle()
  if (error) throw dbError(error)
  if (data && data.achieved !== null) return
  const saved = data ? await source.client.from('challenges').update(row).eq('id', data.id) : await source.client.from('challenges').insert({ ...row, user_id: source.userId })
  if (saved.error) throw dbError(saved.error)
}

/** Challenges another metric this week; its target starts 5% better than its last measured value. */
export async function changeChallenge(source: DataSource, { id, metric, baseline }: { id: string; metric: Metric; baseline: number }): Promise<void> {
  await updateChallenge(source, id, { metric, baseline, target: startTarget(metric, baseline) })
}

export function useChangeChallenge() {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (change: { id: string; metric: Metric; baseline: number }) => changeChallenge(need(source), change),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: metricsKey(owner) })
    },
  })
}
