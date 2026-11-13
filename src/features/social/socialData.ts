import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays } from 'date-fns'
import { addDays as addLocalDays, weekStart as weekStartHelper } from '@/features/planner/time'
import { useTimezone } from '@/hooks/useNow'
import { dbError, need, readAll, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { dateKeyInTimezone, resolveTimezone, timePartsInTimezone, zonedLocalToIso } from '@/lib/timezone'
import type { TablesInsert } from '@/types/database'
import { listBlockedUserIds } from './safety'
import { isCode, myNumbers, normalizeCode, type Friend, type MyNumbers, type Nudge, type NudgeKind, type SharedStats, type SharedView } from './social'

// Partners and nudges, from Supabase or (Demo Mode) the device. Real friends need accounts: in
// Demo Mode the student's own sharing is kept on the device, Aarav is a sample partner, and codes
// can't connect anyone.

export const socialKey = (owner: string | null) => ['social', owner] as const

const STREAK_LOOKBACK_DAYS = 60
const NUDGE_DAYS = 7

export type Published = Omit<TablesInsert<'shared_stats'>, 'user_id'>

// ---------------------------------------------------------------------------
// My sharing and numbers
// ---------------------------------------------------------------------------

export async function loadMyStats(source: DataSource): Promise<SharedStats | null> {
  if (source.kind === 'demo') return demoDb.list('shared_stats')[0] ?? null
  const { data, error } = await source.client.from('shared_stats').select('*').eq('user_id', source.userId).maybeSingle()
  if (error) throw dbError(error)
  return data
}

/** Saves what the student shares and the numbers (one row per student). */
export async function saveMyStats(source: DataSource, row: Published): Promise<void> {
  if (source.kind === 'demo') {
    const existing = demoDb.list('shared_stats')[0]
    if (existing) demoDb.update('shared_stats', existing.id, row)
    else demoDb.insert('shared_stats', [row])
    return
  }
  const { error } = await source.client.from('shared_stats').upsert({ ...row, user_id: source.userId }, { onConflict: 'user_id' })
  if (error) throw dbError(error)
}

/** This week's focus minutes, the study streak and the plan done %, from the student's own data. */
export async function loadMyNumbers(source: DataSource, now: Date, timeZone?: string): Promise<MyNumbers> {
  if (source.kind === 'demo') return myNumbers({ now, focus: demoDb.list('focus_sessions'), blocks: demoDb.list('plan_blocks'), timeZone })
  const { client, userId } = source
  const zone = resolveTimezone(timeZone)
  const weekStartDate = weekStartHelper(dateKeyInTimezone(now, zone))
  const weekEndDate = addLocalDays(weekStartDate, 6)
  const [focus, blocks] = await Promise.all([
    readAll((from, to) =>
      client.from('focus_sessions').select('started_at, actual_minutes').eq('user_id', userId).gte('started_at', addDays(now, -STREAK_LOOKBACK_DAYS).toISOString()).order('id').range(from, to),
    ),
    readAll((from, to) =>
      client.from('plan_blocks').select('date, status').eq('user_id', userId).gte('date', weekStartDate).lte('date', weekEndDate).order('id').range(from, to),
    ),
  ])
  return myNumbers({ now, focus, blocks, timeZone: zone })
}

// ---------------------------------------------------------------------------
// Partners
// ---------------------------------------------------------------------------

export const SAMPLE_PARTNER_ID = 'sample-aarav'

/** Demo Mode's sample partner: their numbers grow through the week; they study 19:00–21:00. */
export function samplePartner(now: Date, timeZone?: string): Friend {
  const zone = resolveTimezone(timeZone)
  const parts = timePartsInTimezone(now, zone)
  const daysIn = (parts.weekday + 6) % 7
  const studying = parts.hour >= 19 && parts.hour < 21 ? zonedLocalToIso(parts.date, 21 * 60, zone) : null
  const name = 'Aarav (sample)'
  return {
    userId: SAMPLE_PARTNER_ID,
    name,
    sample: true,
    stats: {
      user_id: SAMPLE_PARTNER_ID,
      display_name: name,
      week_start: weekStartHelper(parts.date),
      focus_minutes: 70 + daysIn * 80,
      streak_days: 5 + daysIn,
      plan_pct: 72,
      on_leaderboard: true,
      studying_until: studying,
      studying_now: studying !== null,
      updated_at: now.toISOString(),
    },
  }
}

/** Shared numbers of these students (only partners' and group mates' are readable). */
export async function loadSharedViews(source: Extract<DataSource, { kind: 'supabase' }>, ids: string[]): Promise<Map<string, SharedView>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await source.client.from('shared_stats_view').select('*').in('user_id', ids)
  if (error) throw dbError(error)
  return new Map(data.flatMap((row) => (row.user_id ? [[row.user_id, row] as const] : [])))
}

export async function listPartners(source: DataSource, now: Date, timeZone?: string): Promise<Friend[]> {
  const blocked = await listBlockedUserIds(source)
  if (source.kind === 'demo') {
    return blocked.has(SAMPLE_PARTNER_ID) ? [] : [samplePartner(now, timeZone)]
  }
  const { data, error } = await source.client.from('partner_links').select('partner_id, created_at').eq('user_id', source.userId).order('created_at')
  if (error) throw dbError(error)
  const activeLinks = data.filter((link) => !blocked.has(link.partner_id))
  const views = await loadSharedViews(
    source,
    activeLinks.map((link) => link.partner_id),
  )
  return activeLinks.map((link) => {
    const stats = views.get(link.partner_id) ?? null
    return { userId: link.partner_id, name: stats?.display_name ?? 'Your partner', stats }
  })
}

/** A code for a friend to become your partner (7 days; the same one until it's used, unless `fresh`). */
export async function partnerCode(source: DataSource, { fresh = false }: { fresh?: boolean } = {}): Promise<{ code: string; expiresAt: string }> {
  if (source.kind === 'demo') return { code: '5A3D0E7C21', expiresAt: addDays(new Date(), 7).toISOString() }
  const { client, userId } = source
  if (fresh) {
    const removed = await client.from('partner_invites').delete().eq('user_id', userId)
    if (removed.error) throw dbError(removed.error)
  } else {
    const { data, error } = await client.from('partner_invites').select('code, expires_at').eq('user_id', userId).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1)
    if (error) throw dbError(error)
    const [current] = data
    if (current) return { code: current.code, expiresAt: current.expires_at }
  }
  const { data, error } = await client.from('partner_invites').insert({}).select('code, expires_at').single()
  if (error) throw dbError(error)
  return { code: data.code, expiresAt: data.expires_at }
}

export async function acceptPartnerCode(source: DataSource, code: string): Promise<void> {
  if (!isCode(code)) throw new Error('Enter the 10-character partner code.')
  if (source.kind === 'demo') throw new Error("Demo Mode can't connect to real friends. Sign in to use partner codes.")
  const { error } = await source.client.rpc('accept_partner_invite', { code: normalizeCode(code) })
  if (error) throw dbError(error)
}

/** Ends a partnership (both ways). */
export async function removePartner(source: DataSource, partnerId: string): Promise<void> {
  if (source.kind === 'demo') throw new Error('The sample partner stays in Demo Mode.')
  const { error } = await source.client.from('partner_links').delete().eq('user_id', source.userId).eq('partner_id', partnerId)
  if (error) throw dbError(error)
}

// ---------------------------------------------------------------------------
// Nudges
// ---------------------------------------------------------------------------

export type ReceivedNudge = Nudge & { from: string }

/** The last 7 days' nudges: received ones with the sender's name, and the ones sent (to count today's). */
export async function listNudges(source: DataSource, now: Date): Promise<{ received: ReceivedNudge[]; sent: Nudge[] }> {
  if (source.kind === 'demo') return { received: [], sent: [] }
  const blocked = await listBlockedUserIds(source)
  const { data, error } = await source.client
    .from('nudges')
    .select('*')
    .or(`user_id.eq.${source.userId},to_user_id.eq.${source.userId}`)
    .gte('created_at', addDays(now, -NUDGE_DAYS).toISOString())
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw dbError(error)
  const received = data.filter((nudge) => nudge.to_user_id === source.userId && !blocked.has(nudge.user_id))
  const names = await loadSharedViews(source, [...new Set(received.map((nudge) => nudge.user_id))])
  return {
    received: received.map((nudge) => ({ ...nudge, from: names.get(nudge.user_id)?.display_name ?? 'A friend' })),
    sent: data.filter((nudge) => nudge.user_id === source.userId),
  }
}

export async function sendNudge(source: DataSource, { to, kind, message }: { to: string; kind: NudgeKind; message?: string }): Promise<void> {
  // Demo Mode: the sample friend can't get it; the screen says so.
  if (source.kind === 'demo' || to === SAMPLE_PARTNER_ID) return
  const { error } = await source.client.from('nudges').insert({ to_user_id: to, kind, message: message?.trim().slice(0, 140) || null })
  if (error) throw dbError(error)
}

export async function markNudgesSeen(source: DataSource, ids: string[]): Promise<void> {
  if (source.kind === 'demo' || ids.length === 0) return
  const { error } = await source.client.from('nudges').update({ seen_at: new Date().toISOString() }).in('id', ids)
  if (error) throw dbError(error)
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useMyStats() {
  const { source, owner } = useDataSource()
  return useQuery({ queryKey: [...socialKey(owner), 'mine'], queryFn: () => loadMyStats(need(source)), enabled: source !== null })
}

/** My numbers this week (only worked out once sharing is set up). */
export function useMyNumbers(enabled = true) {
  const { source, owner } = useDataSource()
  const timeZone = useTimezone()
  return useQuery({
    queryKey: [...socialKey(owner), 'numbers', timeZone],
    queryFn: () => loadMyNumbers(need(source), new Date(), timeZone),
    enabled: source !== null && enabled,
    refetchInterval: 5 * 60_000,
  })
}

export function usePartners() {
  const { source, owner } = useDataSource()
  const timeZone = useTimezone()
  return useQuery({
    queryKey: [...socialKey(owner), 'partners', timeZone],
    queryFn: () => listPartners(need(source), new Date(), timeZone),
    enabled: source !== null,
    refetchInterval: 2 * 60_000,
  })
}

/** Nudges (once sharing is set up), checked every minute, also while the app is in the background (for the notification). */
export function useNudges(enabled = true) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...socialKey(owner), 'nudges'],
    queryFn: () => listNudges(need(source), new Date()),
    enabled: source !== null && enabled,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  })
}

/** A change to partners, sharing or nudges. Afterwards every social view reloads. */
export function useSocialMutation<Variables, Result = void>(run: (source: DataSource, variables: Variables) => Promise<Result>) {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: Variables) => run(need(source), variables),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: socialKey(owner) })
    },
  })
}
