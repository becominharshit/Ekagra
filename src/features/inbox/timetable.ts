import { slotsLabel } from '@/features/attendance/labels'
import { newBlockId, routineToRows, rowsToRoutine, validateRoutine, type RoutineRowDraft, type RoutineRowLike } from '@/features/onboarding/routineDraft'

// A timetable the AI read, on its way into the routine: classes of the same course at the same time
// become one block on several days, and the routine keeps everything except its old class times
// (the same form model as Me → Edit routine). Pure, tested in timetable.test.ts.

export interface TimetableClass {
  /** The course as the timetable names it. */
  subject: string
  subjectId: string | null
  /** 0 = Sunday … 6 = Saturday */
  days: number[]
  /** 'HH:MM' */
  start: string
  end: string
}

const sortedDays = (days: number[]) => [...new Set(days)].sort((a, b) => a - b)

/** One block per course and time, with all its days; earliest first. */
export function mergeClasses(classes: TimetableClass[]): TimetableClass[] {
  const merged = new Map<string, TimetableClass>()
  for (const item of classes) {
    const subject = item.subject.trim()
    const key = [subject.toLowerCase(), item.subjectId ?? '', item.start, item.end].join('|')
    const same = merged.get(key)
    if (same) same.days = sortedDays([...same.days, ...item.days])
    else merged.set(key, { ...item, subject, days: sortedDays(item.days) })
  }
  return [...merged.values()].sort((a, b) => a.start.localeCompare(b.start) || (a.days[0] ?? 0) - (b.days[0] ?? 0))
}

/** Course names in the timetable that aren't subjects yet, each once. */
export function newCourses(classes: TimetableClass[]): string[] {
  const names = new Map<string, string>()
  for (const item of classes) {
    const key = item.subject.trim().toLowerCase()
    if (item.subjectId === null && key && !names.has(key)) names.set(key, item.subject.trim())
  }
  return [...names.values()]
}

/** Links classes without a subject to the subject of the same name (e.g. ones just made for the timetable). */
export function linkClasses(classes: TimetableClass[], subjects: { id: string; name: string }[]): TimetableClass[] {
  const byName = new Map(subjects.map((subject) => [subject.name.trim().toLowerCase(), subject.id]))
  return classes.map((item) => (item.subjectId !== null ? item : { ...item, subjectId: byName.get(item.subject.trim().toLowerCase()) ?? null }))
}

/** The routine with its class times replaced by the timetable's (sleep, meals, gym and the rest stay), and any problems. */
export function routineWithTimetable(current: RoutineRowLike[], classes: TimetableClass[]): { rows: RoutineRowDraft[]; problems: string[] } {
  const draft = rowsToRoutine(current)
  draft.classes = classes.map((item) => ({
    id: newBlockId(),
    title: item.subject.trim().slice(0, 80),
    days: sortedDays(item.days),
    start: item.start,
    end: item.end,
    subjectId: item.subjectId,
  }))
  return { rows: routineToRows(draft), problems: validateRoutine(draft) }
}

/** "Mon, Wed 09:00–10:00" */
export function classTimeLabel(item: Pick<TimetableClass, 'days' | 'start' | 'end'>): string {
  return slotsLabel([{ subjectId: '', start: item.start, end: item.end, daysOfWeek: item.days, validFrom: null, validTo: null }])
}
