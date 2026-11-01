import { z } from 'zod'
import { dbError, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Json } from '@/types/database'
import type { Hustle } from './hustles'
import { updateHustle } from './hustles'
import { TEMPLATES, toHustleType, type HustleType, type Platform } from './templates'
import { addFocusTime } from './time'

// The Intentional Launchpad: opening an outreach or social platform from Hustle (Upwork,
// Instagram, …) starts a 10-minute session with a goal ("Send 3 proposals"), so the visit has a
// purpose and an end. Done in time, it counts as hustle time (a focus session and a time entry).

export const LAUNCHPAD_MINUTES = 10
/** Coming back later than this still logs at most this many minutes (the session was 10). */
const MAX_LOGGED_MINUTES = 15

/** A launch that is running (kept on the device, so it survives switching apps). */
export interface ActiveLaunch {
  /** The focus session's id, made when it starts. */
  id: string
  hustleId: string
  hustleName: string
  platform: string
  url: string
  intention: string
  startedAt: string
  minutes: number
}

export const INTENTIONS: Record<HustleType, string[]> = {
  freelancing: ['Send 3 proposals', 'Reply to client messages', 'Improve my profile'],
  content: ["Post today's video", 'Reply to comments', "Check the last post's numbers"],
  startup: ['Message 5 possible users', 'Post about what I built', 'Reply to feedback'],
  parttime: ['Message 3 students or parents', "Confirm this week's sessions", 'Share my schedule'],
  custom: ['Do one outreach task', 'Reply to messages'],
}

const LinkSchema = z.object({ label: z.string().trim().min(1).max(40), url: z.string().url().max(500) })

/** A hustle's saved links (hustles.links), keeping only valid web links. */
export function parseLinks(value: Json | undefined): Platform[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const parsed = LinkSchema.safeParse(entry)
    return parsed.success && /^https?:\/\//i.test(parsed.data.url) ? [parsed.data] : []
  })
}

/** "upwork.com/freelancers/me" → "https://upwork.com/freelancers/me"; null when it isn't a web link. */
export function normalizeUrl(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

/** The platforms to open for a hustle: its own links first, then the template's (unless one has the same name). */
export function platformsFor(hustle: Pick<Hustle, 'type' | 'links'>): Platform[] {
  const own = parseLinks(hustle.links)
  const names = new Set(own.map((link) => link.label.toLowerCase()))
  return [...own, ...TEMPLATES[toHustleType(hustle.type)].platforms.filter((platform) => !names.has(platform.label.toLowerCase()))]
}

/** Seconds left in a launch (negative once the time is up). */
export function secondsLeft(launch: Pick<ActiveLaunch, 'startedAt' | 'minutes'>, now: Date): number {
  return Math.round((Date.parse(launch.startedAt) + launch.minutes * 60_000 - now.getTime()) / 1000)
}

/** Minutes a finished launch counts: the time it ran, at least 1 and at most 15. */
export function minutesToLog(launch: Pick<ActiveLaunch, 'startedAt'>, now: Date): number {
  const minutes = Math.round((now.getTime() - Date.parse(launch.startedAt)) / 60_000)
  return Math.max(1, Math.min(MAX_LOGGED_MINUTES, minutes))
}

/** Ends a launch: always saved as a focus session; when the student did it, its minutes count as hustle time. */
export async function finishLaunch(source: DataSource, { launch, did, now = new Date() }: { launch: ActiveLaunch; did: boolean; now?: Date }): Promise<void> {
  const minutes = minutesToLog(launch, now)
  const session = {
    id: launch.id,
    area: 'hustle',
    hustle_id: launch.hustleId,
    mode: 'custom',
    started_at: launch.startedAt,
    ended_at: now.toISOString(),
    planned_minutes: launch.minutes,
    actual_minutes: did ? minutes : null,
    outcome: did ? 'done' : 'stopped',
    completed: did,
  }
  if (source.kind === 'demo') demoDb.insert('focus_sessions', [session])
  else {
    const { error } = await source.client.from('focus_sessions').insert(session)
    if (error) throw dbError(error)
  }
  if (did) await addFocusTime(source, { hustleId: launch.hustleId, sessionId: launch.id, startedAt: launch.startedAt, endedAt: now.toISOString(), minutes })
}

/** Saves a hustle's own links (portfolio, profiles, channels). */
export function saveLinks(source: DataSource, { hustleId, links }: { hustleId: string; links: Platform[] }): Promise<void> {
  return updateHustle(source, { id: hustleId, patch: { links: links.map(({ label, url }) => ({ label, url })) } })
}
