import { format } from 'date-fns'
import type { Mode } from '@/features/mode/modes'
import type { Tables, TablesInsert } from '@/types/database'
import type { LocalDate, Minute, Plan } from './types'

// The saved plan: the planner's blocks as rows of plan_blocks, and the rules around them
// (what's left to do, when to re-plan, which block is running). Plain functions, tested.
//
// The planner works in local dates and minutes; the database stores UTC timestamps. The device's
// time zone is the student's time zone here.

export type PlanBlock = Tables<'plan_blocks'>
type WorkRow = Pick<PlanBlock, 'topic_id' | 'task_id' | 'subject_id' | 'date' | 'status' | 'planned_minutes' | 'actual_minutes'>
type TimeRow = Pick<PlanBlock, 'start_at' | 'end_at' | 'status'>

/** A local date and minute of the day (e.g. 14:30 = 870) as a UTC timestamp. */
export function localToIso(date: LocalDate, minute: Minute): string {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number)
  return new Date(year, month - 1, day, 0, minute).toISOString()
}

/** The local date of a moment ('YYYY-MM-DD'). */
export function localDateOf(at: Date | string): LocalDate {
  return format(new Date(at), 'yyyy-MM-dd')
}

/** Minutes after local midnight. */
export function minuteOf(at: Date): Minute {
  return at.getHours() * 60 + at.getMinutes()
}

/** The plan as rows to save. Blocks of work that can't be finished in time are marked at_risk. */
export function planRows(plan: Plan, version: number): TablesInsert<'plan_blocks'>[] {
  const risky = new Set(plan.atRisk.map((item) => item.key))
  return plan.days.flatMap((day) =>
    day.blocks.map((block) => ({
      date: block.date,
      start_at: localToIso(block.date, block.start),
      end_at: localToIso(block.date, block.end),
      area: block.area,
      kind: block.kind,
      subject_id: block.subjectId ?? null,
      topic_id: block.topicId ?? null,
      task_id: block.taskId ?? null,
      hustle_id: block.hustleId ?? null,
      title: block.title,
      planned_minutes: block.end - block.start,
      status: 'planned',
      at_risk: risky.has(block.key),
      plan_version: version,
    })),
  )
}

/** Minutes a block counts as done: all of it when done (or running), what was done when partial. */
export function minutesDone(block: Pick<PlanBlock, 'status' | 'planned_minutes' | 'actual_minutes'>): number {
  if (block.status === 'done') return block.actual_minutes ?? block.planned_minutes
  if (block.status === 'partial') return block.actual_minutes ?? Math.round(block.planned_minutes / 2)
  if (block.status === 'in_progress') return block.planned_minutes
  return 0
}

export interface WorkDone {
  byTopic: Map<string, number>
  byTask: Map<string, number>
  /** Study minutes of each subject today (for re-planning in the middle of the day). */
  todayBySubject: Map<string, number>
}

/** How much work went into each topic and task, from the blocks done so far. */
export function workDone(blocks: WorkRow[], today: LocalDate): WorkDone {
  const result: WorkDone = { byTopic: new Map(), byTask: new Map(), todayBySubject: new Map() }
  const add = (map: Map<string, number>, key: string | null, minutes: number) => {
    if (key) map.set(key, (map.get(key) ?? 0) + minutes)
  }
  for (const block of blocks) {
    const minutes = minutesDone(block)
    if (minutes <= 0) continue
    add(result.byTopic, block.topic_id, minutes)
    add(result.byTask, block.task_id, minutes)
    if (block.date === today && block.topic_id) add(result.todayBySubject, block.subject_id, minutes)
  }
  return result
}

/** Minutes studied per subject on the days from `from` to `to` (both included). */
export function minutesBySubject(blocks: WorkRow[], from: LocalDate, to: LocalDate): Map<string, number> {
  const result = new Map<string, number>()
  for (const block of blocks) {
    if (!block.subject_id || !block.topic_id || block.date < from || block.date > to) continue
    const minutes = minutesDone(block)
    if (minutes > 0) result.set(block.subject_id, (result.get(block.subject_id) ?? 0) + minutes)
  }
  return result
}

/**
 * What's left of an estimate after the work done. A topic or task that isn't finished keeps at
 * least 30 minutes (or its whole estimate if that's less): it leaves the plan when it's finished,
 * not when its time is used up.
 */
export function remainingMinutes(estimate: number, done: number): number {
  if (done <= 0) return estimate
  return Math.max(estimate - done, Math.min(estimate, 30))
}

/** Re-planning from now starts after the block that is running (it stays as it is). */
export function replanStart(todayBlocks: TimeRow[], now: Date): Date {
  let start = now.getTime()
  for (const block of todayBlocks) {
    const begins = Date.parse(block.start_at)
    const ends = Date.parse(block.end_at)
    if (block.status !== 'missed' && begins <= now.getTime() && ends > start) start = ends
  }
  return new Date(start)
}

/** The block running at `now` (a skipped one doesn't count). */
export function blockAt<T extends TimeRow>(blocks: T[], now: Date): T | null {
  const time = now.getTime()
  return blocks.find((block) => block.status !== 'missed' && Date.parse(block.start_at) <= time && time < Date.parse(block.end_at)) ?? null
}

/** The next blocks still to do after `now`, earliest first. */
export function blocksAfter<T extends TimeRow>(blocks: T[], now: Date, count: number): T[] {
  return blocks
    .filter((block) => block.status === 'planned' && Date.parse(block.start_at) > now.getTime())
    .sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at))
    .slice(0, count)
}

/** The mode a block puts you in (personal tasks use Life time). */
export function blockMode(area: string): Exclude<Mode, 'free'> {
  if (area === 'academics') return 'study'
  if (area === 'hustle') return 'hustle'
  return 'life'
}

/** The last time the plan was made (kept on the device). */
export interface PlanRun {
  ranOn: LocalDate
  /** The first day that run planned: today, or tomorrow after the evening check-in. */
  plannedFrom: LocalDate
  /** What the planner's inputs looked like (see planFingerprint). */
  fingerprint: string
}

/** The saved plan is fine for today when its inputs haven't changed and it was made today or for today. */
export function planIsFresh(run: PlanRun | null, today: LocalDate, fingerprint: string): boolean {
  if (!run || run.fingerprint !== fingerprint) return false
  return run.ranOn === today || run.plannedFrom === today
}

/** A short fingerprint of anything (stable JSON, then a 32-bit hash): when it changes, the plan is made again. */
export function planFingerprint(inputs: unknown): string {
  const text = JSON.stringify(inputs)
  let hash = 5381
  for (let index = 0; index < text.length; index++) hash = (hash * 33 + text.charCodeAt(index)) | 0
  return (hash >>> 0).toString(36)
}
