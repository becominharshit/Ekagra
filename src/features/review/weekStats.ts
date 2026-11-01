import { addDays, format } from 'date-fns'
import type { Area, Budget } from '@/features/planner/types'

// The numbers of one week (Monday to Sunday) for the Sunday review: time per area against the
// budget, plan blocks done, each subject, topics learned, quiz accuracy (also by part of the day,
// over the last 4 weeks), flashcard retention, focus, distractions, check-ins, tasks and hustle.
// Pure functions, tested on their own.

export const DAY_WINDOWS = ['morning', 'afternoon', 'evening', 'night'] as const
export type DayWindow = (typeof DAY_WINDOWS)[number]

/** The local hours of each part of the day (night also takes the hours after midnight). */
export const WINDOW_HOURS: Record<DayWindow, [start: number, end: number]> = {
  morning: [6, 12],
  afternoon: [12, 17],
  evening: [17, 21],
  night: [21, 24],
}

export const WINDOW_LABEL: Record<DayWindow, string> = { morning: 'mornings', afternoon: 'afternoons', evening: 'evenings', night: 'nights' }

export function dayWindowOf(date: Date): DayWindow {
  const hour = date.getHours()
  if (hour >= WINDOW_HOURS.morning[0] && hour < WINDOW_HOURS.morning[1]) return 'morning'
  if (hour >= WINDOW_HOURS.afternoon[0] && hour < WINDOW_HOURS.afternoon[1]) return 'afternoon'
  if (hour >= WINDOW_HOURS.evening[0] && hour < WINDOW_HOURS.evening[1]) return 'evening'
  return 'night'
}

/** Accuracy by part of the day looks back this many days, so there are enough answers to compare. */
export const WINDOW_DAYS = 28

const AREAS: Area[] = ['academics', 'hustle', 'life']
/** What counts as a distraction (mode switches have their own reasons). */
const DISTRACTIONS = new Set(['self_report', 'blocked_open', 'tollbooth_unlock', 'tollbooth_failed'])

export interface WeekStatsInputs {
  /** The Monday the week began (local midnight). */
  weekStart: Date
  budget: Budget
  subjects: { id: string; name: string }[]
  blocks: { date: string; area: string; subject_id: string | null; planned_minutes: number; actual_minutes: number | null; status: string }[]
  topics: { subject_id: string; title: string; learned_at: string | null }[]
  /** Answers of the last 4 weeks (or more). */
  attempts: { question_id: string; is_correct: boolean | null; created_at: string }[]
  questionSubjects: ReadonlyMap<string, string | null>
  reviews: { rating: number; reviewed_at: string }[]
  focus: { started_at: string; actual_minutes: number | null; completed: boolean }[]
  distractions: { kind: string; app_package: string | null; reason: string | null; at: string }[]
  /** Names of blocked apps by package, e.g. com.instagram.android → Instagram (null: the package name is shown). */
  appLabels: ReadonlyMap<string, string | null>
  checkIns: { date: string; energy: number | null; mood: number | null; minimum_day: boolean }[]
  tasks: { status: string; completed_at: string | null; due_at: string | null }[]
  timeEntries: { minutes: number; started_at: string }[]
  transactions: { kind: string; amount: number; currency: string; occurred_on: string }[]
}

type Share = { attempts: number; accuracy: number | null }

/** A type (not an interface) so it can be saved as JSON in weekly_reviews.stats. */
export type WeekStats = {
  weekStart: string
  weekEnd: string
  /** Minutes planned and done per area, the budget and the share of the time actually spent (%). */
  areas: Record<Area, { planned: number; done: number; budgetPct: number; sharePct: number }>
  blocks: { planned: number; done: number; partial: number; missed: number; open: number }
  subjects: { id: string; name: string; planned: number; done: number; attempts: number; accuracy: number | null }[]
  topicsLearned: { title: string; subjectId: string }[]
  quiz: Share
  /** Over the last 4 weeks. */
  accuracyByWindow: Record<DayWindow, Share>
  reviews: { count: number; retention: number | null }
  focus: { minutes: number; sessions: number; completed: number }
  distractions: {
    total: number
    unlocks: number
    topApps: { app: string; count: number }[]
    topHours: { hour: number; count: number }[]
    /** Why study blocks were left early (mode switches). */
    reasons: { reason: string; count: number }[]
  }
  checkIns: { days: number; energy: number | null; mood: number | null; crashedDays: number }
  tasks: { completed: number; overdue: number }
  hustle: { minutes: number; income: { currency: string; amount: number }[] }
}

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places
const share = (right: number, total: number): number | null => (total > 0 ? round(right / total, 3) : null)
const average = (values: number[]): number | null => (values.length > 0 ? round(values.reduce((sum, value) => sum + value, 0) / values.length, 1) : null)
const isArea = (value: string): value is Area => (AREAS as string[]).includes(value)

/** The most frequent values, biggest first (ties keep the order they first appeared in). */
function top<T>(values: T[], count: number): { value: T; count: number }[] {
  const counts = new Map<T, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts]
    .map(([value, times]) => ({ value, count: times }))
    .sort((a, b) => b.count - a.count)
    .slice(0, count)
}

function doneMinutes(block: WeekStatsInputs['blocks'][number]): number {
  if (block.status !== 'done' && block.status !== 'partial') return 0
  return block.actual_minutes ?? (block.status === 'done' ? block.planned_minutes : 0)
}

export function weekStats(inputs: WeekStatsInputs): WeekStats {
  const from = inputs.weekStart.getTime()
  const to = addDays(inputs.weekStart, 7).getTime()
  const firstDay = format(inputs.weekStart, 'yyyy-MM-dd')
  const lastDay = format(addDays(inputs.weekStart, 6), 'yyyy-MM-dd')
  const inWeek = (iso: string | null) => {
    if (!iso) return false
    const at = Date.parse(iso)
    return at >= from && at < to
  }
  const onWeekDay = (date: string) => date >= firstDay && date <= lastDay

  // Plan blocks (moved ones were planned again elsewhere, so they don't count twice).
  const blocks = inputs.blocks.filter((block) => onWeekDay(block.date) && block.status !== 'moved')
  const areas = Object.fromEntries(AREAS.map((area) => [area, { planned: 0, done: 0, budgetPct: inputs.budget[area], sharePct: 0 }])) as WeekStats['areas']
  for (const block of blocks) {
    if (!isArea(block.area)) continue
    areas[block.area].planned += block.planned_minutes
    areas[block.area].done += doneMinutes(block)
  }
  const totalDone = AREAS.reduce((sum, area) => sum + areas[area].done, 0)
  for (const area of AREAS) areas[area].sharePct = totalDone > 0 ? Math.round((areas[area].done / totalDone) * 100) : 0
  const count = (status: string[]) => blocks.filter((block) => status.includes(block.status)).length

  // Answers: this week's, and the last 4 weeks' by part of the day.
  const weekAttempts = inputs.attempts.filter((attempt) => attempt.is_correct !== null && inWeek(attempt.created_at))
  const windowFrom = to - WINDOW_DAYS * 24 * 60 * 60 * 1000
  const accuracyByWindow = Object.fromEntries(DAY_WINDOWS.map((window) => [window, { attempts: 0, accuracy: null }])) as Record<DayWindow, Share>
  const windowRight = Object.fromEntries(DAY_WINDOWS.map((window) => [window, 0])) as Record<DayWindow, number>
  for (const attempt of inputs.attempts) {
    const at = Date.parse(attempt.created_at)
    if (attempt.is_correct === null || at < windowFrom || at >= to) continue
    const window = dayWindowOf(new Date(at))
    accuracyByWindow[window].attempts += 1
    if (attempt.is_correct) windowRight[window] += 1
  }
  for (const window of DAY_WINDOWS) accuracyByWindow[window].accuracy = share(windowRight[window], accuracyByWindow[window].attempts)

  const names = new Map(inputs.subjects.map((subject) => [subject.id, subject.name]))
  const subjects = inputs.subjects
    .map((subject) => {
      const own = blocks.filter((block) => block.subject_id === subject.id)
      const answers = weekAttempts.filter((attempt) => inputs.questionSubjects.get(attempt.question_id) === subject.id)
      return {
        id: subject.id,
        name: subject.name,
        planned: own.reduce((sum, block) => sum + block.planned_minutes, 0),
        done: own.reduce((sum, block) => sum + doneMinutes(block), 0),
        attempts: answers.length,
        accuracy: share(answers.filter((attempt) => attempt.is_correct).length, answers.length),
      }
    })
    .filter((subject) => subject.planned > 0 || subject.attempts > 0)
    .sort((a, b) => b.done - a.done || b.planned - a.planned)

  const reviews = inputs.reviews.filter((review) => inWeek(review.reviewed_at))
  const focus = inputs.focus.filter((session) => inWeek(session.started_at))
  const events = inputs.distractions.filter((event) => inWeek(event.at))
  const distractions = events.filter((event) => DISTRACTIONS.has(event.kind))
  const appOf = (event: (typeof events)[number]) => (event.app_package ? (inputs.appLabels.get(event.app_package) ?? event.app_package) : null)
  const checkIns = inputs.checkIns.filter((checkIn) => onWeekDay(checkIn.date))

  const income = new Map<string, number>()
  for (const transaction of inputs.transactions) {
    if (transaction.kind !== 'income' || !onWeekDay(transaction.occurred_on)) continue
    income.set(transaction.currency, (income.get(transaction.currency) ?? 0) + Number(transaction.amount))
  }

  return {
    weekStart: firstDay,
    weekEnd: lastDay,
    areas,
    blocks: { planned: blocks.length, done: count(['done']), partial: count(['partial']), missed: count(['missed']), open: count(['planned', 'in_progress']) },
    subjects,
    topicsLearned: inputs.topics
      .filter((topic) => inWeek(topic.learned_at) && names.has(topic.subject_id))
      .map((topic) => ({ title: topic.title, subjectId: topic.subject_id })),
    quiz: { attempts: weekAttempts.length, accuracy: share(weekAttempts.filter((attempt) => attempt.is_correct).length, weekAttempts.length) },
    accuracyByWindow,
    reviews: { count: reviews.length, retention: share(reviews.filter((review) => review.rating >= 3).length, reviews.length) },
    focus: {
      minutes: focus.reduce((sum, session) => sum + (session.actual_minutes ?? 0), 0),
      sessions: focus.length,
      completed: focus.filter((session) => session.completed).length,
    },
    distractions: {
      total: distractions.length,
      unlocks: distractions.filter((event) => event.kind === 'tollbooth_unlock').length,
      topApps: top(
        distractions.map(appOf).filter((app): app is string => app !== null),
        3,
      ).map(({ value, count: times }) => ({ app: value, count: times })),
      topHours: top(
        distractions.map((event) => new Date(event.at).getHours()),
        3,
      ).map(({ value, count: times }) => ({ hour: value, count: times })),
      reasons: top(
        events.filter((event) => event.kind === 'mode_switch' && event.reason).map((event) => event.reason ?? ''),
        4,
      ).map(({ value, count: times }) => ({ reason: value, count: times })),
    },
    checkIns: {
      days: checkIns.length,
      energy: average(checkIns.flatMap((checkIn) => (checkIn.energy === null ? [] : [checkIn.energy]))),
      mood: average(checkIns.flatMap((checkIn) => (checkIn.mood === null ? [] : [checkIn.mood]))),
      crashedDays: checkIns.filter((checkIn) => checkIn.minimum_day).length,
    },
    tasks: {
      completed: inputs.tasks.filter((task) => task.status === 'done' && inWeek(task.completed_at)).length,
      overdue: inputs.tasks.filter((task) => task.status !== 'done' && task.status !== 'skipped' && task.due_at !== null && Date.parse(task.due_at) < to).length,
    },
    hustle: {
      minutes: inputs.timeEntries.filter((entry) => inWeek(entry.started_at)).reduce((sum, entry) => sum + entry.minutes, 0),
      income: [...income].map(([currency, amount]) => ({ currency, amount: round(amount, 2) })),
    },
  }
}

/** Days from a week's Monday to its review day (0 = Sunday … 6 = Saturday): Sunday is day 6; a Monday review is the next Monday. */
export function reviewOffset(reviewDay: number): number {
  return reviewDay === 1 ? 7 : (reviewDay + 6) % 7
}

/**
 * The week a review is about (its Monday): the latest week whose review day has come. With the
 * usual Sunday, that's this week on Sunday and last week from Monday to Saturday.
 */
export function reviewWeekStart(now: Date, reviewDay = 0): Date {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const thisMonday = addDays(today, -((today.getDay() + 6) % 7))
  const daysIn = Math.round((today.getTime() - thisMonday.getTime()) / 86_400_000)
  return daysIn >= reviewOffset(reviewDay) ? thisMonday : addDays(thisMonday, -7)
}
