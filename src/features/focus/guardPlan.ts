import { blockAt, type PlanBlock } from '@/features/planner/schedule'
import type { FocusSession } from './sessions'
import { sessionPhases } from './sessions'
import { pausedMs, scheduleMinutes, type Pause, type TimerLengths } from './timer'

// What FocusGuard (the Android app blocker) should do right now: block the picked apps during a
// focus session (and, with "Every Study block", during study blocks too) until it ends. Plus the
// links its blocker screen opens. Plain functions, tested.

/** When a session's timer ends: its start, plus its schedule, plus the time it was paused so far. */
export function sessionEndsAt(session: Pick<FocusSession, 'started_at' | 'mode' | 'planned_minutes'>, pauses: Pause[], now: Date, lengths?: TimerLengths): number {
  return Date.parse(session.started_at) + pausedMs(pauses, now) + scheduleMinutes(sessionPhases(session, lengths)) * 60_000
}

export interface GuardPlanInput {
  now: Date
  /** The running focus session: its title and when its timer ends. */
  session: { title: string; endsAt: number } | null
  blocks: Pick<PlanBlock, 'area' | 'status' | 'start_at' | 'end_at' | 'title'>[]
  blockDuring: 'focus_sessions' | 'study_blocks'
  blockedPackages: string[]
  unlocksLeft: number
}

export interface GuardPlan {
  title: string
  endsAt: number
  blockedPackages: string[]
  emergencyUnlocksLeft: number
}

const MINUTE = 60_000

/** What to block and until when; null = nothing to block now. The end is rounded up to the minute. */
export function guardPlan({ now, session, blocks, blockDuring, blockedPackages, unlocksLeft }: GuardPlanInput): GuardPlan | null {
  if (blockedPackages.length === 0) return null
  const reasons: { title: string; endsAt: number }[] = []
  if (session && session.endsAt > now.getTime()) reasons.push(session)
  if (blockDuring === 'study_blocks') {
    const study = blockAt(
      blocks.filter((block) => block.area === 'academics' && (block.status === 'planned' || block.status === 'in_progress')),
      now,
    )
    if (study) reasons.push({ title: study.title, endsAt: Date.parse(study.end_at) })
  }
  const [first] = reasons
  if (!first) return null
  const endsAt = Math.max(...reasons.map((reason) => reason.endsAt))
  return {
    title: first.title,
    endsAt: Math.ceil(endsAt / MINUTE) * MINUTE,
    blockedPackages: [...new Set(blockedPackages)].sort(),
    emergencyUnlocksLeft: Math.max(0, unlocksLeft),
  }
}

/**
 * The screen for a link from FocusGuard's blocker screen: ekagra://focus → the focus screen,
 * ekagra://focus/tollbooth?app=…&label=… → the Academic Tollbooth for that app. Other links → null.
 */
export function focusRoute(url: string): string | null {
  let link: URL
  try {
    link = new URL(url)
  } catch {
    return null
  }
  if (link.protocol !== 'ekagra:' || link.hostname !== 'focus') return null
  if (link.pathname !== '/tollbooth') return '/today/focus'
  const params = new URLSearchParams()
  for (const key of ['app', 'label']) {
    const value = link.searchParams.get(key)
    if (value) params.set(key, value)
  }
  const query = params.toString()
  return query ? `/today/focus/tollbooth?${query}` : '/today/focus/tollbooth'
}
