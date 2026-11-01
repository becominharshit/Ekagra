import { useQuery } from '@tanstack/react-query'
import { addFocusTime } from '@/features/hustle/time'
import { planKey } from '@/features/planner/planBlocks'
import type { PlanBlock } from '@/features/planner/schedule'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'
import { DEFAULT_LENGTHS, scheduleFor, timerAt, workThatFits, type FocusMode, type Pause, type Phase, type TimerLengths } from './timer'

// Focus sessions (focus_sessions), in Supabase or (Demo Mode) on the device. A session runs a
// Pomodoro, Deep work or custom timer, for a plan block or on its own. When it ends, the minutes
// focused (breaks and pauses left out) become the block's actual_minutes, which the planner
// counts, and for a hustle also its hours (time_entries). Pauses are kept on the device (focusStore.ts).

export type FocusSession = Tables<'focus_sessions'>
export type BlockOutcome = 'done' | 'partial' | 'missed'
/** What a session on its own is for. */
export type FocusArea = 'academics' | 'hustle' | 'life'

const MINUTE = 60_000
const MODES: FocusMode[] = ['pomodoro', 'deep', 'custom']

export function toFocusMode(value: string): FocusMode {
  return MODES.find((mode) => mode === value) ?? 'custom'
}

/** The minutes a session for a block can use: until the block ends (at least 5), or the whole block when it hasn't started yet. */
export function minutesLeftIn(block: Pick<PlanBlock, 'start_at' | 'end_at' | 'planned_minutes'>, now: Date): number {
  if (Date.parse(block.start_at) > now.getTime()) return block.planned_minutes
  return Math.max(5, Math.round((Date.parse(block.end_at) - now.getTime()) / MINUTE))
}

/** Part of a block in 5-minute steps: at least 5 minutes, never all of it. */
export function partOf(plannedMinutes: number, fraction: number): number {
  const minutes = Math.round((plannedMinutes * fraction) / 5) * 5
  return Math.min(Math.max(5, minutes), Math.max(5, plannedMinutes - 5))
}

/** A session's timer phases, from its mode and its planned minutes of focus. */
export function sessionPhases(session: Pick<FocusSession, 'mode' | 'planned_minutes'>, lengths: TimerLengths = DEFAULT_LENGTHS): Phase[] {
  return scheduleFor(toFocusMode(session.mode), session.planned_minutes, lengths)
}

/** Whole minutes focused up to `now`: breaks, pauses and time after the planned focus don't count. */
export function focusedMinutes(
  session: Pick<FocusSession, 'mode' | 'planned_minutes' | 'started_at'>,
  pauses: Pause[],
  now: Date,
  lengths: TimerLengths = DEFAULT_LENGTHS,
): number {
  return Math.round(timerAt(sessionPhases(session, lengths), session.started_at, pauses, now).focused / 60)
}

const AREA_WORD: Record<string, string> = { academics: 'Study', hustle: 'Hustle', life: 'Life', personal: 'Life' }

/** What a session is called: its block's title, else its hustle or subject, else "Study session" and the like. */
export function sessionTitle(session: Pick<FocusSession, 'area'>, names: { block?: string | null; subject?: string | null; hustle?: string | null }): string {
  return names.block ?? names.hustle ?? names.subject ?? `${AREA_WORD[session.area] ?? 'Focus'} session`
}

function sessionArea(area: string): FocusSession['area'] {
  return area === 'hustle' || area === 'life' || area === 'personal' ? area : 'academics'
}

async function patchBlock(source: DataSource, id: string, patch: TablesUpdate<'plan_blocks'>): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.update('plan_blocks', id, patch)
    return
  }
  const { error } = await source.client.from('plan_blocks').update(patch).eq('id', id)
  if (error) throw dbError(error)
}

async function patchSession(source: DataSource, id: string, patch: TablesUpdate<'focus_sessions'>): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.update('focus_sessions', id, patch)
    return
  }
  const { error } = await source.client.from('focus_sessions').update(patch).eq('id', id)
  if (error) throw dbError(error)
}

/** Studying a topic for the first time moves it from "not started" to "learning". */
async function markTopicStarted(source: DataSource, topicId: string): Promise<void> {
  if (source.kind === 'demo') {
    if (demoDb.get('topics', topicId)?.status === 'not_started') demoDb.update('topics', topicId, { status: 'learning' })
    return
  }
  const { error } = await source.client.from('topics').update({ status: 'learning' }).eq('id', topicId).eq('status', 'not_started')
  if (error) throw dbError(error)
}

/** The focus session that is running (started and not finished), if any. */
export async function loadActiveFocus(source: DataSource): Promise<FocusSession | null> {
  if (source.kind === 'demo') {
    return demoDb
      .list('focus_sessions')
      .filter((session) => session.ended_at === null)
      .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))[0] ?? null
  }
  const { data, error } = await source.client
    .from('focus_sessions')
    .select('*')
    .eq('user_id', source.userId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
  if (error) throw dbError(error)
  return data[0] ?? null
}

export interface FocusStart {
  /** The plan block it's for; null = a session on its own. */
  block: PlanBlock | null
  /** For a session on its own: what it's for (a block brings its own). */
  area?: FocusArea
  subjectId?: string | null
  hustleId?: string | null
  mode: FocusMode
  /** Minutes of focus (Pomodoro and Deep work add their breaks on top). Left out: what fits the time the block has left. */
  workMinutes?: number
  /** Pomodoro and Deep work lengths, used to fit the block. */
  lengths?: TimerLengths
  now?: Date
}

/** Focus minutes when none were picked: what fits the block's time left, or 30 minutes on its own. */
const OWN_MINUTES = 30

/** Starts a focus session (its block becomes "in progress"). Returns the session's id. */
export async function startFocus(
  source: DataSource,
  { block, area = 'academics', subjectId = null, hustleId = null, mode, workMinutes, lengths = DEFAULT_LENGTHS, now = new Date() }: FocusStart,
): Promise<string> {
  const minutes = workMinutes ?? (block ? workThatFits(mode, minutesLeftIn(block, now), lengths) : OWN_MINUTES)
  const id = crypto.randomUUID()
  const session: TablesInsert<'focus_sessions'> = {
    id,
    plan_block_id: block?.id ?? null,
    area: block ? sessionArea(block.area) : area,
    subject_id: block ? block.subject_id : area === 'academics' ? subjectId : null,
    // Time focused for a hustle becomes its hours when the session ends.
    hustle_id: block ? block.hustle_id : area === 'hustle' ? hustleId : null,
    mode,
    started_at: now.toISOString(),
    planned_minutes: Math.max(1, Math.round(minutes)),
  }
  if (source.kind === 'demo') demoDb.insert('focus_sessions', [session])
  else {
    const { error } = await source.client.from('focus_sessions').insert(session)
    if (error) throw dbError(error)
  }
  if (block) await patchBlock(source, block.id, { status: 'in_progress' })
  return id
}

/** Ends a session with its result. Minutes focused for a hustle count as its hours (earnings per hour). */
async function closeSession(source: DataSource, session: FocusSession, outcome: 'done' | 'partial' | 'stopped', focused: number, now: Date): Promise<void> {
  await patchSession(source, session.id, { ended_at: now.toISOString(), actual_minutes: focused, outcome, completed: outcome === 'done' })
  if (!session.hustle_id) return
  await addFocusTime(source, { hustleId: session.hustle_id, sessionId: session.id, startedAt: session.started_at, endedAt: now.toISOString(), minutes: focused })
}

/**
 * Done, Partly or Skip for a block. With a focus session, the minutes focused count (`focused`,
 * from the timer on this device; without it, the time since the start up to the planned focus).
 * Without a session, Done counts the whole block and Partly what the student picked.
 * Skipped work is planned again at the next re-plan.
 */
export async function finishBlock(
  source: DataSource,
  {
    block,
    outcome,
    minutes,
    session,
    focused,
    now = new Date(),
  }: { block: PlanBlock; outcome: BlockOutcome; minutes?: number; session?: FocusSession | null; focused?: number; now?: Date },
): Promise<void> {
  const worked = session ? (focused ?? focusedMinutes(session, [], now)) : null
  let actual = 0
  if (outcome === 'done') actual = worked ?? block.planned_minutes
  if (outcome === 'partial') actual = worked ?? minutes ?? partOf(block.planned_minutes, 0.5)
  await patchBlock(source, block.id, { status: outcome, actual_minutes: actual })
  if (session) await closeSession(source, session, outcome === 'missed' ? 'stopped' : outcome, worked ?? 0, now)
  if (outcome !== 'missed' && block.topic_id) await markTopicStarted(source, block.topic_id)
}

/** Done for a session on its own (without a plan block). */
export async function finishSession(source: DataSource, { session, focused, now = new Date() }: { session: FocusSession; focused?: number; now?: Date }): Promise<void> {
  await closeSession(source, session, 'done', focused ?? focusedMinutes(session, [], now), now)
}

/** Stop: the session ends without a result and its block (if any) is still to do. The minutes focused still count. */
export async function stopFocus(source: DataSource, { session, focused, now = new Date() }: { session: FocusSession; focused?: number; now?: Date }): Promise<void> {
  await closeSession(source, session, 'stopped', focused ?? focusedMinutes(session, [], now), now)
  const blockId = session.plan_block_id
  if (!blockId) return
  // Back to "planned", unless the block was finished some other way meanwhile.
  if (source.kind === 'demo') {
    if (demoDb.get('plan_blocks', blockId)?.status === 'in_progress') demoDb.update('plan_blocks', blockId, { status: 'planned' })
    return
  }
  const { error } = await source.client.from('plan_blocks').update({ status: 'planned' }).eq('id', blockId).eq('status', 'in_progress')
  if (error) throw dbError(error)
}

export function useActiveFocus() {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...planKey(owner), 'focus'],
    queryFn: () => loadActiveFocus(need(source)),
    enabled: source !== null,
  })
}
