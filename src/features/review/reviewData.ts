import { addDays, format } from 'date-fns'
import { listSubjects } from '@/features/academics/subjects'
import type { Budget } from '@/features/planner/types'
import { dbError, readAll, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { WINDOW_DAYS, weekStats, type WeekStats, type WeekStatsInputs } from './weekStats'

// The weekly review's data, from Supabase or (Demo Mode) the device.

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
  const subjects = (await listSubjects(source)).map((subject) => ({ id: subject.id, name: subject.name }))
  if (source.kind === 'demo') {
    return {
      weekStart,
      budget,
      subjects,
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
