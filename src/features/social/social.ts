import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import { currentStreak } from '@/features/life/habits/habits'
import type { Tables, TablesInsert } from '@/types/database'

// Sharing with an accountability partner and study groups: the numbers a student may share (focus
// minutes this week, study streak, plan done %, studying now), what is published (only what they
// chose: the database refuses the rest), invite codes and nudges. Pure functions, tested on their own.

export type SharedStats = Tables<'shared_stats'>
export type SharedView = Tables<'shared_stats_view'>
export type Nudge = Tables<'nudges'>

/** A partner or group mate, with what they share. */
export interface Friend {
  userId: string
  name: string
  /** Their shared numbers (null: they haven't set up sharing yet). */
  stats: SharedView | null
  /** A made-up friend in Demo Mode. */
  sample?: boolean
}

/** What a student chose to share, and the name others see. */
export interface Sharing {
  displayName: string
  focus: boolean
  streak: boolean
  plan: boolean
  studying: boolean
  leaderboard: boolean
}

export const DEFAULT_SHARING: Sharing = { displayName: 'Student', focus: true, streak: true, plan: false, studying: true, leaderboard: false }

export function readSharing(row: Pick<SharedStats, 'display_name' | 'share_focus' | 'share_streak' | 'share_plan' | 'share_studying' | 'on_leaderboard'> | null): Sharing {
  if (!row) return DEFAULT_SHARING
  return { displayName: row.display_name, focus: row.share_focus, streak: row.share_streak, plan: row.share_plan, studying: row.share_studying, leaderboard: row.on_leaderboard }
}

/** The first name, as others see it by default. */
export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0]?.slice(0, 40) || 'Student'
}

/** A day counts towards the study streak with this many focus minutes. */
export const STREAK_MINUTES = 15

export interface MyNumbers {
  /** The Monday of this week, 'YYYY-MM-DD'. */
  weekStart: string
  focusMinutes: number
  streakDays: number
  /** Plan blocks done this week, in % (a partly done block counts half); null before any block ended. */
  planPct: number | null
}

export interface NumbersInputs {
  now: Date
  focus: Pick<Tables<'focus_sessions'>, 'started_at' | 'actual_minutes'>[]
  blocks: Pick<Tables<'plan_blocks'>, 'date' | 'status'>[]
}

export function myNumbers({ now, focus, blocks }: NumbersInputs): MyNumbers {
  const monday = startOfWeek(now, { weekStartsOn: 1 })
  const weekStart = format(monday, 'yyyy-MM-dd')
  const weekEnd = format(addDays(monday, 6), 'yyyy-MM-dd')
  const today = format(now, 'yyyy-MM-dd')
  const minutesByDay = new Map<string, number>()
  for (const session of focus) {
    const date = format(parseISO(session.started_at), 'yyyy-MM-dd')
    minutesByDay.set(date, (minutesByDay.get(date) ?? 0) + (session.actual_minutes ?? 0))
  }
  const focusMinutes = [...minutesByDay].filter(([date]) => date >= weekStart && date <= weekEnd).reduce((sum, [, minutes]) => sum + minutes, 0)
  const studied = new Set([...minutesByDay].filter(([, minutes]) => minutes >= STREAK_MINUTES).map(([date]) => date))
  const ended = blocks.filter((block) => block.date >= weekStart && block.date <= weekEnd && ['done', 'partial', 'missed'].includes(block.status))
  const done = ended.reduce((sum, block) => sum + (block.status === 'done' ? 1 : block.status === 'partial' ? 0.5 : 0), 0)
  return {
    weekStart,
    focusMinutes: Math.min(10_080, Math.round(focusMinutes)),
    streakDays: currentStreak({ days_of_week: [0, 1, 2, 3, 4, 5, 6] }, studied, today),
    planPct: ended.length > 0 ? Math.round((done / ended.length) * 100) : null,
  }
}

/** The row to publish: only the numbers the student chose (the database refuses the others). */
export function toPublished(sharing: Sharing, numbers: MyNumbers | null, studyingUntil: string | null): Omit<TablesInsert<'shared_stats'>, 'user_id'> {
  const name = sharing.displayName.trim().slice(0, 40) || 'Student'
  return {
    display_name: name,
    share_focus: sharing.focus || sharing.leaderboard,
    share_streak: sharing.streak,
    share_plan: sharing.plan,
    share_studying: sharing.studying,
    on_leaderboard: sharing.leaderboard,
    week_start: numbers?.weekStart ?? null,
    focus_minutes: (sharing.focus || sharing.leaderboard) && numbers ? numbers.focusMinutes : null,
    streak_days: sharing.streak && numbers ? numbers.streakDays : null,
    plan_pct: sharing.plan && numbers ? numbers.planPct : null,
    studying_until: sharing.studying ? studyingUntil : null,
  }
}

const PUBLISHED_KEYS = [
  'display_name',
  'share_focus',
  'share_streak',
  'share_plan',
  'share_studying',
  'on_leaderboard',
  'week_start',
  'focus_minutes',
  'streak_days',
  'plan_pct',
  'studying_until',
] as const

/** Whether the saved row already says this (times compared as moments: the database writes them its own way). */
export function samePublished(row: ReturnType<typeof toPublished>, saved: SharedStats): boolean {
  return PUBLISHED_KEYS.every((key) => {
    const mine = row[key] ?? null
    const theirs = saved[key] ?? null
    if (key === 'studying_until' && typeof mine === 'string' && typeof theirs === 'string') return Date.parse(mine) === Date.parse(theirs)
    return mine === theirs
  })
}

/** A sharing row as shared_stats_view shows it ("studying now" worked out, an old one hidden). */
export function viewOf(row: SharedStats, now: Date): SharedView {
  const studying = row.studying_until !== null && Date.parse(row.studying_until) > now.getTime()
  return {
    user_id: row.user_id,
    display_name: row.display_name,
    week_start: row.week_start,
    focus_minutes: row.focus_minutes,
    streak_days: row.streak_days,
    plan_pct: row.plan_pct,
    on_leaderboard: row.on_leaderboard,
    studying_until: studying ? row.studying_until : null,
    studying_now: studying,
    updated_at: row.updated_at,
  }
}

/** When a running focus session should end (its start + planned minutes), if that's still ahead. */
export function studyingUntil(session: Pick<Tables<'focus_sessions'>, 'started_at' | 'planned_minutes' | 'ended_at'> | null, now: Date): string | null {
  if (!session || session.ended_at) return null
  const end = parseISO(session.started_at).getTime() + session.planned_minutes * 60_000
  return end > now.getTime() ? new Date(end).toISOString() : null
}

// ---------------------------------------------------------------------------
// Codes
// ---------------------------------------------------------------------------

/** "7F3A9C21B4" → "7F3A9 C21B4" (easier to read out). */
export function formatCode(code: string): string {
  return code.length === 10 ? `${code.slice(0, 5)} ${code.slice(5)}` : code
}

/** What the student typed or pasted, as a code: spaces and dashes go, letters become capitals. */
export function normalizeCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase()
}

export function isCode(input: string): boolean {
  return /^[0-9A-F]{10}$/.test(normalizeCode(input))
}

// ---------------------------------------------------------------------------
// Nudges
// ---------------------------------------------------------------------------

export const NUDGE_KINDS = ['study', 'cheer', 'checkin'] as const
export type NudgeKind = (typeof NUDGE_KINDS)[number]

export const NUDGE_LABEL: Record<NudgeKind, string> = { study: 'Time to study', cheer: 'Cheer', checkin: 'Check in' }
export const NUDGE_TEXT: Record<NudgeKind, string> = {
  study: "It's study time. Open your plan and start one block.",
  cheer: "You've got this. Keep going!",
  checkin: 'How did today go? Do your evening check-in.',
}

export function toNudgeKind(value: string): NudgeKind {
  return NUDGE_KINDS.find((kind) => kind === value) ?? 'study'
}

/** "Riya: It's study time…" (their own message when they wrote one). */
export function nudgeText(nudge: Pick<Nudge, 'kind' | 'message'>, from: string): { title: string; body: string } {
  return { title: `${from}: ${NUDGE_LABEL[toNudgeKind(nudge.kind)]}`, body: nudge.message?.trim() || NUDGE_TEXT[toNudgeKind(nudge.kind)] }
}

/** Nudges sent to the same friend in the last 24 hours (the server allows 3). */
export function nudgesLeft(sent: Pick<Nudge, 'to_user_id' | 'created_at'>[], to: string, now: Date): number {
  const since = now.getTime() - 24 * 60 * 60_000
  return Math.max(0, 3 - sent.filter((nudge) => nudge.to_user_id === to && Date.parse(nudge.created_at) > since).length)
}

// ---------------------------------------------------------------------------
// Showing someone's numbers
// ---------------------------------------------------------------------------

/** Someone's shared numbers in words; numbers from an older week count as none this week. */
export function sharedLines(view: Pick<SharedView, 'week_start' | 'focus_minutes' | 'streak_days' | 'plan_pct'>, weekStart: string): { focusMinutes: number | null; streakDays: number | null; planPct: number | null } {
  const thisWeek = view.week_start === weekStart
  return {
    focusMinutes: view.focus_minutes === null ? null : thisWeek ? view.focus_minutes : 0,
    streakDays: view.streak_days,
    planPct: thisWeek ? view.plan_pct : null,
  }
}
