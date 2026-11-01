import { useQuery } from '@tanstack/react-query'
import { planKey } from '@/features/planner/planBlocks'
import { blockAt, blocksAfter, type PlanBlock } from '@/features/planner/schedule'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Tables, TablesUpdate } from '@/types/database'

// The Now card's actions: Start Focus (a simple timer for the block, saved to focus_sessions),
// Done, Partial and Skip. The full focus engine (Pomodoro and Deep Work styles, app blocking,
// "I got distracted") is Milestone 9.

export type FocusSession = Tables<'focus_sessions'>
export type BlockOutcome = 'done' | 'partial' | 'missed'

const MINUTE = 60_000

/** Whole minutes from `startedAt` to `now`. */
export function elapsedMinutes(startedAt: string, now: Date): number {
  return Math.max(0, Math.round((now.getTime() - Date.parse(startedAt)) / MINUTE))
}

/** A focus session lasts until the block ends (at least 5 minutes), or the whole block when it hasn't started yet. */
export function focusLength(block: Pick<PlanBlock, 'start_at' | 'end_at' | 'planned_minutes'>, now: Date): number {
  if (Date.parse(block.start_at) > now.getTime()) return block.planned_minutes
  return Math.max(5, Math.round((Date.parse(block.end_at) - now.getTime()) / MINUTE))
}

/** Part of a block in 5-minute steps: at least 5 minutes, never all of it. */
export function partOf(plannedMinutes: number, fraction: number): number {
  const minutes = Math.round((plannedMinutes * fraction) / 5) * 5
  return Math.min(Math.max(5, minutes), Math.max(5, plannedMinutes - 5))
}

/** Minutes worked in a focus session, without counting hours of a timer that was left running. */
export function focusedMinutes(session: Pick<FocusSession, 'started_at' | 'planned_minutes'>, now: Date): number {
  return Math.min(elapsedMinutes(session.started_at, now), session.planned_minutes + 60)
}

export type NowView =
  | { kind: 'focus'; session: FocusSession; block: PlanBlock | null }
  | { kind: 'block'; block: PlanBlock }
  | { kind: 'free'; next: PlanBlock | null }

const isOpen = (block: PlanBlock) => block.status === 'planned' || block.status === 'in_progress'

/** What the Now card shows: the focus session that is running, else the block of right now, else the next one. */
export function nowView(blocks: PlanBlock[], session: FocusSession | null, now: Date): NowView {
  if (session) return { kind: 'focus', session, block: blocks.find((block) => block.id === session.plan_block_id) ?? null }
  const open = blocks.filter(isOpen)
  const current = blockAt(open, now)
  if (current) return { kind: 'block', block: current }
  return { kind: 'free', next: blocksAfter(open, now, 1)[0] ?? null }
}

/** The next blocks after the one of right now. */
export function upNext(blocks: PlanBlock[], now: Date, count = 3): PlanBlock[] {
  return blocksAfter(blocks.filter(isOpen), now, count)
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

/** Start Focus: a timer for the block (until it ends), and the block is "in progress". */
export async function startFocus(source: DataSource, { block, now = new Date() }: { block: PlanBlock; now?: Date }): Promise<void> {
  const session = {
    plan_block_id: block.id,
    area: block.area === 'hustle' || block.area === 'life' || block.area === 'personal' ? block.area : 'academics',
    subject_id: block.subject_id,
    mode: 'custom',
    started_at: now.toISOString(),
    planned_minutes: focusLength(block, now),
  }
  if (source.kind === 'demo') demoDb.insert('focus_sessions', [session])
  else {
    const { error } = await source.client.from('focus_sessions').insert(session)
    if (error) throw dbError(error)
  }
  await patchBlock(source, block.id, { status: 'in_progress' })
}

/**
 * Done, Partial or Skip. With a focus session running, its minutes are what counts; otherwise
 * Done counts the whole block and Partial what the student picked. Skipped work is planned again
 * at the next re-plan.
 */
export async function finishBlock(
  source: DataSource,
  { block, outcome, minutes, session, now = new Date() }: { block: PlanBlock; outcome: BlockOutcome; minutes?: number; session?: FocusSession | null; now?: Date },
): Promise<void> {
  const worked = session ? focusedMinutes(session, now) : null
  let actual = 0
  if (outcome === 'done') actual = worked ?? block.planned_minutes
  if (outcome === 'partial') actual = worked ?? minutes ?? partOf(block.planned_minutes, 0.5)
  await patchBlock(source, block.id, { status: outcome, actual_minutes: actual })
  if (session) {
    await patchSession(source, session.id, {
      ended_at: now.toISOString(),
      actual_minutes: worked,
      outcome: outcome === 'missed' ? 'stopped' : outcome,
      completed: outcome === 'done',
    })
  }
  if (outcome !== 'missed' && block.topic_id) await markTopicStarted(source, block.topic_id)
}

/** Stop: the focus session ends without a result; the block is still to do. */
export async function stopFocus(source: DataSource, { session, now = new Date() }: { session: FocusSession; now?: Date }): Promise<void> {
  await patchSession(source, session.id, { ended_at: now.toISOString(), actual_minutes: focusedMinutes(session, now), outcome: 'stopped', completed: false })
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
