import { format } from 'date-fns'
import type { CAPTURE_FIELDS, CapturedTask } from '@shared/schemas.ts'
import { localToIso } from '@/features/planner/schedule'
import { parseTime } from '@/features/planner/time'
import type { TablesInsert } from '@/types/database'
import { toTaskArea, type Task, type TaskArea } from './taskRules'

// A task being checked in the confirm sheet (or edited), before it is saved.

export type CaptureField = (typeof CAPTURE_FIELDS)[number]

export interface TaskDraft {
  /** Only for the list on screen. */
  key: string
  title: string
  area: TaskArea
  subjectId: string | null
  /** For hustle tasks: the hustle it belongs to. */
  hustleId: string | null
  /** Save it as a card on the hustle's board (a lead or order) instead of a to-do. */
  asCard: boolean
  /** 'YYYY-MM-DD', or '' for no due date. */
  dueDate: string
  /** 'HH:MM', or '' for the end of the day. */
  dueTime: string
  estMinutes: number | null
  priority: number
  /** Fields that were guessed or unclear: highlighted so the student checks them. */
  unsure: CaptureField[]
}

let lastKey = 0
export function draftKey(): string {
  lastKey += 1
  return `draft-${lastKey}`
}

export function blankDraft(): TaskDraft {
  return { key: draftKey(), title: '', area: 'personal', subjectId: null, hustleId: null, asCard: false, dueDate: '', dueTime: '', estMinutes: null, priority: 2, unsure: [] }
}

/** Splits a due timestamp into the date and time fields (23:59 = "end of the day", no time shown). */
function dueParts(dueAt: string | null): { dueDate: string; dueTime: string } {
  if (!dueAt) return { dueDate: '', dueTime: '' }
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return { dueDate: '', dueTime: '' }
  const time = format(due, 'HH:mm')
  return { dueDate: format(due, 'yyyy-MM-dd'), dueTime: time === '23:59' ? '' : time }
}

/** A task the AI found. Its subject key (s1, …) and hustle key (h1, …) become their ids. */
export function capturedToDraft(
  task: CapturedTask,
  subjectIdByKey: ReadonlyMap<string, string>,
  hustleIdByKey: ReadonlyMap<string, string> = new Map(),
): TaskDraft {
  const hustleId = task.hustleKey ? (hustleIdByKey.get(task.hustleKey) ?? null) : null
  const subjectId = !hustleId && task.subjectKey ? (subjectIdByKey.get(task.subjectKey) ?? null) : null
  return {
    key: draftKey(),
    title: task.title,
    area: hustleId ? 'hustle' : subjectId ? 'academics' : task.area,
    subjectId,
    hustleId,
    asCard: hustleId !== null && task.lead,
    ...dueParts(task.dueAt),
    estMinutes: task.estMinutes,
    priority: task.priority,
    unsure: [...new Set(task.unsure)],
  }
}

export function taskToDraft(task: Task): TaskDraft {
  return {
    key: draftKey(),
    title: task.title,
    area: toTaskArea(task.area),
    subjectId: task.subject_id,
    hustleId: task.hustle_id,
    asCard: false,
    ...dueParts(task.due_at),
    estMinutes: task.est_minutes,
    priority: task.priority,
    unsure: [],
  }
}

/** What to fix before saving, in plain words. Empty = ready. */
export function draftProblems(draft: TaskDraft): string[] {
  const problems: string[] = []
  if (!draft.title.trim()) problems.push('Every task needs a title.')
  if (draft.estMinutes !== null && !(draft.estMinutes >= 5 && draft.estMinutes <= 1200)) problems.push('Work time must be between 5 and 1200 minutes.')
  if (draft.dueTime && !draft.dueDate) problems.push('Pick a due date for the time you gave.')
  return problems
}

/** When it's due, as a timestamp. A due date without a time means the end of that day (23:59). */
export function draftDueAt(draft: Pick<TaskDraft, 'dueDate' | 'dueTime'>): string | null {
  return draft.dueDate ? localToIso(draft.dueDate, draft.dueTime ? parseTime(draft.dueTime) : 23 * 60 + 59) : null
}

/** The fields of a tasks row. */
export function draftValues(
  draft: TaskDraft,
): Pick<TablesInsert<'tasks'>, 'title' | 'area' | 'subject_id' | 'hustle_id' | 'due_at' | 'est_minutes' | 'priority'> {
  return {
    title: draft.title.trim(),
    area: draft.area,
    subject_id: draft.area === 'academics' ? draft.subjectId : null,
    hustle_id: draft.area === 'hustle' ? draft.hustleId : null,
    due_at: draftDueAt(draft),
    est_minutes: draft.estMinutes,
    priority: draft.priority,
  }
}
