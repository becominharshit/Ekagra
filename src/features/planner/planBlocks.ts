import { useQuery } from '@tanstack/react-query'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { TablesInsert, TablesUpdate } from '@/types/database'
import type { PlanBlock } from './schedule'
import type { LocalDate } from './types'

// The saved plan (plan_blocks), in Supabase or (Demo Mode) on the device.

/** Every plan query key starts with this, so one refresh after a change updates every plan screen. */
export const planKey = (owner: string | null) => ['plan', owner] as const

export type WorkRow = Pick<PlanBlock, 'topic_id' | 'task_id' | 'subject_id' | 'date' | 'status' | 'planned_minutes' | 'actual_minutes'>

const WORK_STATUSES = ['done', 'partial', 'in_progress']
const byStart = (a: PlanBlock, b: PlanBlock) => Date.parse(a.start_at) - Date.parse(b.start_at)

/** The blocks of the days from `from` to `to` (both included), earliest first. */
export async function listBlocks(source: DataSource, from: LocalDate, to: LocalDate): Promise<PlanBlock[]> {
  if (source.kind === 'demo') return demoDb.list('plan_blocks').filter((block) => block.date >= from && block.date <= to).sort(byStart)
  const { data, error } = await source.client
    .from('plan_blocks')
    .select('*')
    .eq('user_id', source.userId)
    .gte('date', from)
    .lte('date', to)
    .order('start_at')
  if (error) throw dbError(error)
  return data
}

/** Blocks with work in them (done, partial or running): what has gone into each topic and task. */
export async function listWorkRows(source: DataSource): Promise<WorkRow[]> {
  if (source.kind === 'demo') return demoDb.list('plan_blocks').filter((block) => WORK_STATUSES.includes(block.status))
  const { data, error } = await source.client
    .from('plan_blocks')
    .select('topic_id, task_id, subject_id, date, status, planned_minutes, actual_minutes')
    .eq('user_id', source.userId)
    .in('status', WORK_STATUSES)
  if (error) throw dbError(error)
  return data
}

/** The newest plan_version (0 when there is no plan yet). */
export async function latestPlanVersion(source: DataSource): Promise<number> {
  if (source.kind === 'demo') return demoDb.list('plan_blocks').reduce((latest, block) => Math.max(latest, block.plan_version), 0)
  const { data, error } = await source.client
    .from('plan_blocks')
    .select('plan_version')
    .eq('user_id', source.userId)
    .order('plan_version', { ascending: false })
    .limit(1)
  if (error) throw dbError(error)
  return data[0]?.plan_version ?? 0
}

/** Another device saved a newer plan while this one was planning. */
export class PlanConflictError extends Error {
  constructor() {
    super('Your plan was just changed on another device. Showing that plan now.')
    this.name = 'PlanConflictError'
  }
}

export interface PlanSave {
  rows: TablesInsert<'plan_blocks'>[]
  /** Blocks still "planned" from this moment on are replaced by `rows`. */
  replaceFrom: Date
  /** Blocks of earlier days that are still "planned" were not done: they become "missed". */
  missedBefore: LocalDate
  /** The plan_version this plan was made from (see the two-device rule in the technical design). */
  basedOn: number
}

/** Saves a new plan. Done, partial, skipped and running blocks are never touched. */
export async function savePlan(source: DataSource, { rows, replaceFrom, missedBefore, basedOn }: PlanSave): Promise<void> {
  const replaceIso = replaceFrom.toISOString()
  if (source.kind === 'demo') {
    const blocks = demoDb.list('plan_blocks')
    for (const block of blocks) {
      if (block.status === 'planned' && block.date < missedBefore) demoDb.update('plan_blocks', block.id, { status: 'missed' })
    }
    demoDb.remove(
      'plan_blocks',
      blocks.filter((block) => block.status === 'planned' && block.date >= missedBefore && block.start_at >= replaceIso).map((block) => block.id),
    )
    demoDb.insert('plan_blocks', rows)
    return
  }
  if ((await latestPlanVersion(source)) !== basedOn) throw new PlanConflictError()
  const client = source.client
  const missed = await client.from('plan_blocks').update({ status: 'missed' }).eq('user_id', source.userId).eq('status', 'planned').lt('date', missedBefore)
  if (missed.error) throw dbError(missed.error)
  const removed = await client.from('plan_blocks').delete().eq('user_id', source.userId).eq('status', 'planned').gte('start_at', replaceIso)
  if (removed.error) throw dbError(removed.error)
  if (rows.length > 0) {
    const { error } = await client.from('plan_blocks').insert(rows)
    if (error) throw dbError(error)
  }
}

export async function updateBlock(source: DataSource, { id, patch }: { id: string; patch: TablesUpdate<'plan_blocks'> }): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.update('plan_blocks', id, patch)
    return
  }
  const { error } = await source.client.from('plan_blocks').update(patch).eq('id', id)
  if (error) throw dbError(error)
}

/** The saved blocks of the days from `from` to `to`. */
export function useBlocks(from: LocalDate, to: LocalDate) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...planKey(owner), 'blocks', from, to],
    queryFn: () => listBlocks(need(source), from, to),
    enabled: source !== null,
  })
}
