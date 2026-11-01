import { useQuery } from '@tanstack/react-query'
import { finishBlock, type BlockOutcome, type FocusSession } from '@/features/focus/sessions'
import { planKey } from '@/features/planner/planBlocks'
import { burnoutGuard, resolveSettings } from '@/features/planner/planner'
import { localDateOf, type PlanBlock } from '@/features/planner/schedule'
import { addDays } from '@/features/planner/time'
import type { LocalDate, PlannerCheckIn } from '@/features/planner/types'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Tables, TablesUpdate } from '@/types/database'

// Daily check-ins, one row per day: "I Crashed" (a minimum day) and the evening check-in
// (energy, mood, the biggest distraction). Both change the plan.

export type CheckIn = Tables<'daily_checkins'>
type CheckInPatch = Pick<TablesUpdate<'daily_checkins'>, 'minimum_day' | 'crashed_at' | 'energy' | 'mood' | 'top_distraction' | 'checked_in_at'>

/** Check-ins are an input of the plan, so they reload whenever the plan does. */
export const checkInsKey = (owner: string | null) => [...planKey(owner), 'checkins'] as const

/** How many days back check-ins are loaded (the Burnout Guard looks at the last 7). */
export const CHECK_IN_DAYS = 14

const byDate = (a: CheckIn, b: CheckIn) => a.date.localeCompare(b.date)

/** The check-ins from `from` on, oldest first. */
export async function listCheckIns(source: DataSource, from: LocalDate): Promise<CheckIn[]> {
  if (source.kind === 'demo') return demoDb.list('daily_checkins').filter((row) => row.date >= from).sort(byDate)
  const { data, error } = await source.client.from('daily_checkins').select('*').eq('user_id', source.userId).gte('date', from).order('date')
  if (error) throw dbError(error)
  return data
}

/** Saves part of a day's check-in: the day's row is made the first time, then updated. */
export async function saveCheckIn(source: DataSource, date: LocalDate, patch: CheckInPatch): Promise<void> {
  if (source.kind === 'demo') {
    const existing = demoDb.list('daily_checkins').find((row) => row.date === date)
    if (existing) demoDb.update('daily_checkins', existing.id, patch)
    else demoDb.insert('daily_checkins', [{ date, ...patch }])
    return
  }
  const { error } = await source.client.from('daily_checkins').upsert({ user_id: source.userId, date, ...patch }, { onConflict: 'user_id,date' })
  if (error) throw dbError(error)
}

/** "I Crashed": today becomes a minimum day. */
export function crashToday(source: DataSource, now: Date): Promise<void> {
  return saveCheckIn(source, localDateOf(now), { minimum_day: true, crashed_at: now.toISOString() })
}

/** Undo "I Crashed": the day gets its normal plan back. */
export function undoCrash(source: DataSource, date: LocalDate): Promise<void> {
  return saveCheckIn(source, date, { minimum_day: false, crashed_at: null })
}

export interface EveningCheckInInput {
  date: LocalDate
  energy: number
  mood: number
  topDistraction: string | null
  /** What happened in each of today's blocks so far. */
  outcomes: { block: PlanBlock; outcome: BlockOutcome }[]
  /** The focus session that is running, if any: it ends with its block. */
  session: FocusSession | null
  /** Minutes focused in that session so far (from the timer on this device). */
  focused?: number
  now?: Date
}

/** The evening check-in: today's blocks get their outcome, then energy, mood and the biggest distraction are saved. */
export async function saveEveningCheckIn(
  source: DataSource,
  { date, energy, mood, topDistraction, outcomes, session, focused, now = new Date() }: EveningCheckInInput,
): Promise<void> {
  for (const { block, outcome } of outcomes) {
    if (block.status === outcome) continue
    const itsSession = session?.plan_block_id === block.id
    await finishBlock(source, { block, outcome, session: itsSession ? session : null, focused: itsSession ? focused : undefined, now })
  }
  await saveCheckIn(source, date, { energy, mood, top_distraction: topDistraction, checked_in_at: now.toISOString() })
}

export function toPlannerCheckIns(rows: CheckIn[]): PlannerCheckIn[] {
  return rows.map((row) => ({ date: row.date, energy: row.energy, minimumDay: row.minimum_day }))
}

/** Whether the Burnout Guard makes `date` 30% lighter (the last 3 check-ins before it had energy ≤ 2). */
export function guardOn(date: LocalDate, rows: CheckIn[]): boolean {
  return burnoutGuard(date, toPlannerCheckIns(rows), resolveSettings())
}

/** The check-ins of the last 2 weeks (including today). */
export function useCheckIns(today: LocalDate) {
  const { source, owner } = useDataSource()
  const from = addDays(today, -CHECK_IN_DAYS)
  return useQuery({
    queryKey: [...checkInsKey(owner), from],
    queryFn: () => listCheckIns(need(source), from),
    enabled: source !== null,
  })
}
