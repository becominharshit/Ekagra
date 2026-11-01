import { differenceInCalendarDays, format } from 'date-fns'
import { localDateOf, minuteOf, remainingMinutes } from '@/features/planner/schedule'
import type { PlannerTask } from '@/features/planner/types'
import type { Tables } from '@/types/database'

// Tasks: assignments, to-dos and deadlines. Plain functions, tested on their own.

export type Task = Tables<'tasks'>
export type TaskArea = 'academics' | 'hustle' | 'life' | 'personal'

export const AREA_LABEL: Record<TaskArea, string> = { academics: 'College', hustle: 'Hustle', life: 'Life', personal: 'Personal' }
export const PRIORITY_LABEL: Record<number, string> = { 1: 'Urgent', 2: 'Normal', 3: 'Low', 4: 'Someday' }

/** Minutes of work a task without an estimate gets in the plan. */
export const DEFAULT_TASK_MINUTES = 60

export function isOpenTask(task: Pick<Task, 'status'>): boolean {
  return task.status === 'todo' || task.status === 'doing'
}

export function toTaskArea(value: string): TaskArea {
  return value === 'academics' || value === 'hustle' || value === 'life' ? value : 'personal'
}

/** Open tasks due within `hours` (and overdue ones), the soonest first. */
export function dueSoon(tasks: Task[], now: Date, hours = 72): Task[] {
  const limit = now.getTime() + hours * 3_600_000
  return tasks
    .filter((task) => isOpenTask(task) && task.due_at !== null && Date.parse(task.due_at) <= limit)
    .sort((a, b) => Date.parse(a.due_at ?? '') - Date.parse(b.due_at ?? ''))
}

/** Open tasks first by due date (no date last), then the rest. */
export function byDue(a: Task, b: Task): number {
  const due = (task: Task) => (task.due_at ? Date.parse(task.due_at) : Number.POSITIVE_INFINITY)
  return due(a) - due(b) || a.priority - b.priority || Date.parse(a.created_at) - Date.parse(b.created_at)
}

/** "Overdue by 2 days", "Due today 5:00 PM", "Due tomorrow", "Due Fri 9:00 AM", "Due 15 Nov" or "No due date". */
export function dueLabel(dueAt: string | null, now: Date): string {
  if (!dueAt) return 'No due date'
  const due = new Date(dueAt)
  const late = now.getTime() - due.getTime()
  if (late > 0) {
    const hours = Math.max(1, Math.round(late / 3_600_000))
    return hours < 24 ? `Overdue by ${hours} h` : `Overdue by ${Math.round(hours / 24)} day${Math.round(hours / 24) === 1 ? '' : 's'}`
  }
  const days = differenceInCalendarDays(due, now)
  const time = due.getHours() === 23 && due.getMinutes() === 59 ? '' : ` ${format(due, 'h:mm a')}`
  if (days === 0) return `Due today${time}`
  if (days === 1) return `Due tomorrow${time}`
  if (days < 7) return `Due ${format(due, 'EEE')}${time}`
  return `Due ${format(due, 'd MMM')}`
}

/** The time of day a task is due, for the planner. 23:59 means "by the end of the day": no set time. */
function dueMinuteOf(dueAt: string | null): number | null {
  if (!dueAt) return null
  const minute = minuteOf(new Date(dueAt))
  return minute < 23 * 60 + 59 ? minute : null
}

/** Open tasks in the planner's shape. Minutes already worked come off the estimate. */
export function toPlannerTasks(tasks: Task[], done: ReadonlyMap<string, number>): PlannerTask[] {
  return tasks.filter(isOpenTask).map((task) => ({
    id: task.id,
    area: task.area === 'academics' || task.area === 'hustle' || task.area === 'life' ? task.area : 'personal',
    title: task.title,
    dueDate: task.due_at ? localDateOf(task.due_at) : null,
    dueMinute: dueMinuteOf(task.due_at),
    remainingMinutes: remainingMinutes(task.est_minutes ?? DEFAULT_TASK_MINUTES, done.get(task.id) ?? 0),
    priority: task.priority,
    subjectId: task.subject_id,
    hustleId: task.hustle_id,
  }))
}

/** The device's time as ISO 8601 with its UTC offset, e.g. 2026-11-02T14:30:00+05:30. */
export function isoWithOffset(now: Date): string {
  return format(now, "yyyy-MM-dd'T'HH:mm:ssXXX")
}
