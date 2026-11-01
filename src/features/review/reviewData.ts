import { ReviewResponseSchema } from '@shared/schemas.ts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, format, parseISO } from 'date-fns'
import { academicsKey, listSubjects, updateSubject, type Subject } from '@/features/academics/subjects'
import { callAiFunction } from '@/features/ai/aiClient'
import { toMetric, weekMetrics, weekValues } from '@/features/metrics/metrics'
import { listChallenges, loadMetricInputs, metricsKey, setWeekChallenge } from '@/features/metrics/metricsData'
import { DEFAULT_SKILL_WEEKLY_MINUTES } from '@/features/planner/studyData'
import type { Budget } from '@/features/planner/types'
import { useSaveSettings } from '@/features/profile/queries'
import type { MentorTone, Settings } from '@/features/profile/settings'
import { dbError, need, readAll, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'
import { readReviewChanges, settingsPatch, type Change, type ChangeStatus, type ReviewChange } from './changes'
import { localReview } from './localReview'
import { readReviewAnswer, toReviewRequest, type ReviewContext } from './review'
import { readWeekStats, WINDOW_DAYS, weekStats, type WeekStats, type WeekStatsInputs } from './weekStats'

// The weekly review's data, from Supabase or (Demo Mode) the device: the week's rows, and the
// saved reviews (made once a week; the student then applies or skips each change).

const CHUNK = 100

/** The subject of each question answered (asked 100 at a time). */
async function questionSubjects(source: Extract<DataSource, { kind: 'supabase' }>, ids: string[]): Promise<Map<string, string | null>> {
  const subjects = new Map<string, string | null>()
  const unique = [...new Set(ids)]
  for (let start = 0; start < unique.length; start += CHUNK) {
    const { data, error } = await source.client
      .from('questions')
      .select('id, subject_id')
      .eq('user_id', source.userId)
      .in('id', unique.slice(start, start + CHUNK))
    if (error) throw dbError(error)
    for (const row of data) subjects.set(row.id, row.subject_id)
  }
  return subjects
}

/** What a week's numbers are worked out from. Demo Mode hands over everything (weekStats picks the week). */
export async function loadWeekInputs(source: DataSource, weekStart: Date, budget: Budget): Promise<WeekStatsInputs> {
  const [subjectRows, metricInputs] = await Promise.all([listSubjects(source), loadMetricInputs(source, weekStart)])
  const subjects = subjectRows.map((subject) => ({ id: subject.id, name: subject.name }))
  const metrics = weekValues(weekMetrics(metricInputs, weekStart))
  if (source.kind === 'demo') {
    return {
      weekStart,
      budget,
      subjects,
      metrics,
      blocks: demoDb.list('plan_blocks'),
      topics: demoDb.list('topics'),
      attempts: demoDb.list('attempts'),
      questionSubjects: new Map(demoDb.list('questions').map((question) => [question.id, question.subject_id])),
      reviews: demoDb.list('flashcard_reviews'),
      focus: demoDb.list('focus_sessions'),
      distractions: demoDb.list('distraction_events'),
      appLabels: new Map(demoDb.list('blocked_apps').map((app) => [app.package_name, app.label])),
      checkIns: demoDb.list('daily_checkins'),
      tasks: demoDb.list('tasks'),
      timeEntries: demoDb.list('time_entries'),
      transactions: demoDb.list('transactions'),
    }
  }

  const { client, userId } = source
  const from = weekStart.toISOString()
  const to = addDays(weekStart, 7).toISOString()
  const firstDay = format(weekStart, 'yyyy-MM-dd')
  const lastDay = format(addDays(weekStart, 6), 'yyyy-MM-dd')
  const [blocks, topics, attempts, reviews, focus, distractions, apps, checkIns, tasks, timeEntries, transactions] = await Promise.all([
    readAll((start, end) =>
      client.from('plan_blocks').select('date, area, subject_id, planned_minutes, actual_minutes, status').eq('user_id', userId).gte('date', firstDay).lte('date', lastDay).order('id').range(start, end),
    ),
    readAll((start, end) => client.from('topics').select('subject_id, title, learned_at').eq('user_id', userId).gte('learned_at', from).lt('learned_at', to).order('id').range(start, end)),
    readAll((start, end) =>
      client
        .from('attempts')
        .select('question_id, is_correct, created_at')
        .eq('user_id', userId)
        .gte('created_at', addDays(weekStart, 7 - WINDOW_DAYS).toISOString())
        .lt('created_at', to)
        .order('id')
        .range(start, end),
    ),
    readAll((start, end) => client.from('flashcard_reviews').select('rating, reviewed_at').eq('user_id', userId).gte('reviewed_at', from).lt('reviewed_at', to).order('id').range(start, end)),
    readAll((start, end) => client.from('focus_sessions').select('started_at, actual_minutes, completed').eq('user_id', userId).gte('started_at', from).lt('started_at', to).order('id').range(start, end)),
    readAll((start, end) => client.from('distraction_events').select('kind, app_package, reason, at').eq('user_id', userId).gte('at', from).lt('at', to).order('id').range(start, end)),
    readAll((start, end) => client.from('blocked_apps').select('package_name, label').eq('user_id', userId).order('id').range(start, end)),
    readAll((start, end) => client.from('daily_checkins').select('date, energy, mood, minimum_day').eq('user_id', userId).gte('date', firstDay).lte('date', lastDay).order('id').range(start, end)),
    // All tasks: the open ones (overdue or not) and the ones finished this week.
    readAll((start, end) => client.from('tasks').select('status, completed_at, due_at').eq('user_id', userId).order('id').range(start, end)),
    readAll((start, end) => client.from('time_entries').select('minutes, started_at').eq('user_id', userId).gte('started_at', from).lt('started_at', to).order('id').range(start, end)),
    readAll((start, end) =>
      client.from('transactions').select('kind, amount, currency, occurred_on').eq('user_id', userId).gte('occurred_on', firstDay).lte('occurred_on', lastDay).order('id').range(start, end),
    ),
  ])
  return {
    weekStart,
    budget,
    subjects,
    metrics,
    blocks,
    topics,
    attempts,
    questionSubjects: await questionSubjects(
      source,
      attempts.map((attempt) => attempt.question_id),
    ),
    reviews,
    focus,
    distractions,
    appLabels: new Map(apps.map((app) => [app.package_name, app.label])),
    checkIns,
    tasks,
    timeEntries,
    transactions,
  }
}

export async function loadWeekStats(source: DataSource, weekStart: Date, budget: Budget): Promise<WeekStats> {
  return weekStats(await loadWeekInputs(source, weekStart, budget))
}

// ---------------------------------------------------------------------------
// Saved reviews (weekly_reviews): made once a week, then the student applies or skips the changes
// ---------------------------------------------------------------------------

export type WeeklyReview = Tables<'weekly_reviews'>

export const reviewKey = (owner: string | null) => ['review', owner] as const

export async function loadReview(source: DataSource, weekStart: string): Promise<WeeklyReview | null> {
  if (source.kind === 'demo') return demoDb.list('weekly_reviews').find((review) => review.week_start === weekStart) ?? null
  const { data, error } = await source.client.from('weekly_reviews').select('*').eq('user_id', source.userId).eq('week_start', weekStart).maybeSingle()
  if (error) throw dbError(error)
  return data
}

type ReviewRow = Required<Pick<TablesInsert<'weekly_reviews'>, 'week_start' | 'stats' | 'insights' | 'changes' | 'source' | 'model' | 'prompt_version'>>

/** One review per week: making it again replaces the old one. */
async function saveReview(source: DataSource, row: ReviewRow): Promise<WeeklyReview> {
  if (source.kind === 'demo') {
    const existing = demoDb.list('weekly_reviews').find((review) => review.week_start === row.week_start)
    if (existing) return demoDb.update('weekly_reviews', existing.id, { ...row, completed_at: null })
    const [inserted] = demoDb.insert('weekly_reviews', [row])
    if (!inserted) throw new Error('The review was not saved.')
    return inserted
  }
  const { data, error } = await source.client
    .from('weekly_reviews')
    .upsert({ ...row, completed_at: null, user_id: source.userId }, { onConflict: 'user_id,week_start' })
    .select()
    .single()
  if (error) throw dbError(error)
  return data
}

export async function updateReview(source: DataSource, { id, patch }: { id: string; patch: Pick<TablesUpdate<'weekly_reviews'>, 'changes' | 'completed_at'> }): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.update('weekly_reviews', id, patch)
    return
  }
  const { error } = await source.client.from('weekly_reviews').update(patch).eq('id', id)
  if (error) throw dbError(error)
}

/** What a review needs besides the week's rows. */
export interface ReviewSetup {
  settings: Settings
  subjects: Subject[]
  mentorTone: MentorTone
  /** The best focus hours used now. */
  peak: { start: string; end: string }
  /** 'YYYY-MM-DD' */
  today: string
}

/**
 * Makes and saves the review of a week: its numbers, then 3 insights and up to 3 changes from
 * ai-review (signed in) or from the rules on the device (Demo Mode, and when the AI can't).
 */
export async function makeReview(source: DataSource, weekStart: Date, setup: ReviewSetup): Promise<{ review: WeeklyReview; aiError: string | null }> {
  const [stats, challenges] = await Promise.all([loadWeekStats(source, weekStart, setup.settings.budget), listChallenges(source)])
  const challenge = challenges.find((row) => row.week_start === stats.weekStart)
  const ctx: ReviewContext = {
    settings: setup.settings,
    subjects: new Map(setup.subjects.map((subject) => [subject.id, { name: subject.name, kind: subject.kind, weeklyMinutes: subject.weekly_minutes_limit, examDate: subject.exam_date }])),
    metrics: stats.metrics,
    peak: setup.peak,
    defaultSkillMinutes: DEFAULT_SKILL_WEEKLY_MINUTES,
    mentorTone: setup.mentorTone,
    today: setup.today,
    challenge: challenge ? { metric: toMetric(challenge.metric), target: Number(challenge.target) } : null,
  }
  let written = localReview(stats, ctx)
  let by: 'ai' | 'device' = 'device'
  let model: string | null = null
  let promptVersion: string | null = null
  let aiError: string | null = null
  if (source.kind === 'supabase') {
    try {
      const { request, subjectIdByKey } = toReviewRequest(stats, ctx)
      const answer = await callAiFunction('ai-review', request, ReviewResponseSchema, source.client)
      written = readReviewAnswer(answer, ctx, subjectIdByKey)
      by = 'ai'
      model = answer.model
      promptVersion = answer.promptVersion
    } catch (error) {
      aiError = error instanceof Error ? error.message : 'The AI could not write the review.'
    }
  }
  const review = await saveReview(source, { week_start: stats.weekStart, stats, insights: written.insights, changes: written.changes, source: by, model, prompt_version: promptVersion })
  return { review, aiError }
}

export function useReview(weekStart: string) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...reviewKey(owner), weekStart],
    queryFn: () => loadReview(need(source), weekStart),
    enabled: source !== null,
  })
}

export function useMakeReview() {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ weekStart, setup }: { weekStart: Date; setup: ReviewSetup }) => makeReview(need(source), weekStart, setup),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: reviewKey(owner) })
    },
  })
}

/** The review's changes with one of them replaced (edited by the student, applied or skipped). */
export function withChange(review: Pick<WeeklyReview, 'changes'>, index: number, change: Change, status: ChangeStatus): ReviewChange[] {
  return readReviewChanges(review.changes).map((saved, at) => (at === index ? { ...change, reason: saved.reason, status } : saved))
}

/**
 * Applies one of a review's changes - a setting (the plan is then made again by itself), a skill
 * course's weekly time or next week's challenge - and marks it applied.
 */
export function useApplyReviewChange() {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  const saveSettings = useSaveSettings()
  return useMutation({
    mutationFn: async ({ review, index, change, settings }: { review: WeeklyReview; index: number; change: Change; settings: Settings }) => {
      const data = need(source)
      const patch = settingsPatch(change, settings)
      if (patch) await saveSettings.mutateAsync(patch)
      else if (change.type === 'set_skill_minutes') await updateSubject(data, change.subjectId, { weekly_minutes_limit: change.value })
      else if (change.type === 'challenge_metric') {
        const baseline = readWeekStats(review.stats)?.metrics?.[change.metric]
        if (baseline == null) throw new Error("There wasn't enough practice this week to set that target.")
        await setWeekChallenge(data, { weekStart: format(addDays(parseISO(review.week_start), 7), 'yyyy-MM-dd'), metric: change.metric, baseline })
      }
      await updateReview(data, { id: review.id, patch: { changes: withChange(review, index, change, 'applied') } })
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: reviewKey(owner) }),
        queryClient.invalidateQueries({ queryKey: academicsKey(owner) }),
        queryClient.invalidateQueries({ queryKey: metricsKey(owner) }),
      ])
    },
  })
}

export function useUpdateReview() {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (update: Parameters<typeof updateReview>[1]) => updateReview(need(source), update),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: reviewKey(owner) })
    },
  })
}
