import type { Tables } from '@/types/database'
import { sharedLines, type Friend } from './social'

// Study groups: the leaderboard (only members who opted in, by this week's focus minutes), who is
// studying now, and group focus (one running at a time). Pure functions, tested on their own.

export type GroupSession = Tables<'group_sessions'>

export type Member = Friend & { role: string; me: boolean }

export interface GroupView {
  id: string
  name: string
  ownerId: string
  /** The code to join (members can pass it on). */
  code: string
  members: Member[]
  /** Group focus sessions that haven't ended. */
  sessions: GroupSession[]
  /** Demo Mode's sample group. */
  sample?: boolean
}

/** Group focus lengths to pick from, in minutes. */
export const GROUP_FOCUS_MINUTES = [25, 50, 90] as const

export const MAX_GROUP_NAME = 60

export function groupNameProblem(name: string): string | null {
  if (!name.trim()) return 'Give the group a name.'
  if (name.trim().length > MAX_GROUP_NAME) return `Keep the name under ${MAX_GROUP_NAME} characters.`
  return null
}

export interface Ranked {
  userId: string
  name: string
  minutes: number
  rank: number
  me: boolean
}

/** This week's focus minutes of the members on the leaderboard, most first; equal minutes share a rank. */
export function leaderboard(members: Member[], weekStart: string): Ranked[] {
  const rows = members
    .flatMap((member) => {
      if (!member.stats?.on_leaderboard) return []
      const minutes = sharedLines(member.stats, weekStart).focusMinutes
      return minutes === null ? [] : [{ userId: member.userId, name: member.name, minutes, me: member.me }]
    })
    .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name))
  return rows.map((row) => ({ ...row, rank: rows.findIndex((other) => other.minutes === row.minutes) + 1 }))
}

/** Members in a focus session right now, the one finishing first first. */
export function studyingNow(members: Member[]): Member[] {
  return members
    .filter((member) => member.stats?.studying_now && member.stats.studying_until)
    .sort((a, b) => (a.stats?.studying_until ?? '').localeCompare(b.stats?.studying_until ?? ''))
}

/** The group focus going on now (the latest started), if any. */
export function runningSession(sessions: Pick<GroupSession, 'id' | 'user_id' | 'minutes' | 'starts_at' | 'ends_at'>[], now: Date): (typeof sessions)[number] | null {
  const time = now.getTime()
  return [...sessions].filter((session) => Date.parse(session.starts_at) <= time && Date.parse(session.ends_at) > time).sort((a, b) => b.starts_at.localeCompare(a.starts_at))[0] ?? null
}

/** Whole minutes left in a session (at least 1 while it runs). */
export function minutesLeft(session: Pick<GroupSession, 'ends_at'>, now: Date): number {
  return Math.max(1, Math.ceil((Date.parse(session.ends_at) - now.getTime()) / 60_000))
}
