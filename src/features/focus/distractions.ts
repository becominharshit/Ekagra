import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Tables } from '@/types/database'

// "I got distracted": a quick note of what pulled you away during focus, saved as a distraction
// event (kind self_report) in Supabase or (Demo Mode) on the device. The evening check-in
// suggests the day's most noted reason as the biggest distraction.

export type DistractionEvent = Tables<'distraction_events'>

/** The quick reasons (the evening check-in offers the same ones). */
export const DISTRACTION_REASONS = ['Phone or social media', 'YouTube or videos', 'Games', 'Friends or chats', 'Wandering thoughts', 'Too tired', 'Noise or people']

export const distractionsKey = (owner: string | null) => ['distractions', owner] as const

const byTime = (a: DistractionEvent, b: DistractionEvent) => Date.parse(a.at) - Date.parse(b.at)

export async function logDistraction(source: DataSource, { sessionId, reason, at = new Date() }: { sessionId: string | null; reason: string; at?: Date }): Promise<void> {
  const row = { kind: 'self_report', focus_session_id: sessionId, reason: reason.trim().slice(0, 120), at: at.toISOString() }
  if (source.kind === 'demo') {
    demoDb.insert('distraction_events', [row])
    return
  }
  const { error } = await source.client.from('distraction_events').insert(row)
  if (error) throw dbError(error)
}

/** FocusGuard (Android) covered a blocked app: saved as kind blocked_open, for the weekly stats. */
export async function logBlockedOpen(source: DataSource, { packageName, at, sessionId }: { packageName: string; at: Date; sessionId: string | null }): Promise<void> {
  const row = { kind: 'blocked_open', focus_session_id: sessionId, app_package: packageName.slice(0, 200), at: at.toISOString() }
  if (source.kind === 'demo') {
    demoDb.insert('distraction_events', [row])
    return
  }
  const { error } = await source.client.from('distraction_events').insert(row)
  if (error) throw dbError(error)
}

/** Distraction events from `since` (an ISO timestamp) on, oldest first. */
export async function listDistractions(source: DataSource, since: string): Promise<DistractionEvent[]> {
  if (source.kind === 'demo') return demoDb.list('distraction_events').filter((row) => Date.parse(row.at) >= Date.parse(since)).sort(byTime)
  const { data, error } = await source.client.from('distraction_events').select('*').eq('user_id', source.userId).gte('at', since).order('at')
  if (error) throw dbError(error)
  return data
}

/** The reason noted most often (the latest one when tied) and how many times. Null when none was noted. */
export function topReason(events: Pick<DistractionEvent, 'kind' | 'reason' | 'at'>[]): { reason: string; count: number } | null {
  const tally = new Map<string, { count: number; last: number }>()
  for (const event of events) {
    if (event.kind !== 'self_report' || !event.reason) continue
    const entry = tally.get(event.reason) ?? { count: 0, last: 0 }
    tally.set(event.reason, { count: entry.count + 1, last: Math.max(entry.last, Date.parse(event.at)) })
  }
  let best: { reason: string; count: number; last: number } | null = null
  for (const [reason, { count, last }] of tally) {
    if (!best || count > best.count || (count === best.count && last > best.last)) best = { reason, count, last }
  }
  return best && { reason: best.reason, count: best.count }
}

/** The distraction events from `since` on. */
export function useDistractions(since: string) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...distractionsKey(owner), since],
    queryFn: () => listDistractions(need(source), since),
    enabled: source !== null,
  })
}

/** "I got distracted". Afterwards the lists of distractions reload. */
export function useLogDistraction() {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: { sessionId: string | null; reason: string }) => logDistraction(need(source), variables),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: distractionsKey(owner) })
    },
  })
}
