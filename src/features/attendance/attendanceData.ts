import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSubjects } from '@/features/academics/subjects'
import { useProfile, useRoutine } from '@/features/profile/queries'
import { readSettings } from '@/features/profile/settings'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { classSlots, dbTime, type Attendance, type AttendanceStatus, type ClassSlot } from './attendance'

// Attendance, saved in Supabase or (Demo Mode) on the device. A class from the routine is one row
// per subject, date and start time, so marking it again changes that row; classes added by hand
// (an extra lecture) have no start time.

export const attendanceKey = (owner: string | null) => ['attendance', owner] as const

const PAGE_SIZE = 1000
const MAX_PAGES = 20

const newestFirst = (a: Attendance, b: Attendance) => b.date.localeCompare(a.date) || (b.start_time ?? '').localeCompare(a.start_time ?? '')

export async function listAttendance(source: DataSource): Promise<Attendance[]> {
  if (source.kind === 'demo') return demoDb.list('attendance').sort(newestFirst)
  const rows: Attendance[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE
    const { data, error } = await source.client
      .from('attendance')
      .select('*')
      .eq('user_id', source.userId)
      .order('date', { ascending: false })
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw dbError(error)
    rows.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  return rows.sort(newestFirst)
}

interface ClassRef {
  subjectId: string
  date: string
  /** The class's start in the routine, 'HH:MM'. */
  start: string
}

/** Marks a class from the routine (or changes its mark). */
export async function markClass(source: DataSource, { subjectId, date, start, status }: ClassRef & { status: AttendanceStatus }): Promise<void> {
  const startTime = dbTime(start)
  if (source.kind === 'demo') {
    const existing = demoDb.list('attendance').find((row) => row.subject_id === subjectId && row.date === date && row.start_time === startTime)
    if (existing) demoDb.update('attendance', existing.id, { status })
    else demoDb.insert('attendance', [{ subject_id: subjectId, date, start_time: startTime, status }])
    return
  }
  const { error } = await source.client
    .from('attendance')
    .upsert({ user_id: source.userId, subject_id: subjectId, date, start_time: startTime, status }, { onConflict: 'user_id,subject_id,date,start_time' })
  if (error) throw dbError(error)
}

/** Takes a class's mark back: it shows as not marked again. */
export async function unmarkClass(source: DataSource, { subjectId, date, start }: ClassRef): Promise<void> {
  const startTime = dbTime(start)
  if (source.kind === 'demo') {
    const ids = demoDb
      .list('attendance')
      .filter((row) => row.subject_id === subjectId && row.date === date && row.start_time === startTime)
      .map((row) => row.id)
    demoDb.remove('attendance', ids)
    return
  }
  const { error } = await source.client.from('attendance').delete().eq('subject_id', subjectId).eq('date', date).eq('start_time', startTime)
  if (error) throw dbError(error)
}

/** A class that isn't in the routine (an extra lecture, or one before the routine had its subject). */
export async function addClass(source: DataSource, { subjectId, date, status }: { subjectId: string; date: string; status: AttendanceStatus }): Promise<void> {
  const row = { subject_id: subjectId, date, start_time: null, status }
  if (source.kind === 'demo') {
    demoDb.insert('attendance', [row])
    return
  }
  const { error } = await source.client.from('attendance').insert(row)
  if (error) throw dbError(error)
}

export async function setAttendanceStatus(source: DataSource, { id, status }: { id: string; status: AttendanceStatus }): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.update('attendance', id, { status })
    return
  }
  const { error } = await source.client.from('attendance').update({ status }).eq('id', id)
  if (error) throw dbError(error)
}

export async function deleteAttendance(source: DataSource, id: string): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.remove('attendance', [id])
    return
  }
  const { error } = await source.client.from('attendance').delete().eq('id', id)
  if (error) throw dbError(error)
}

export function useAttendance() {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...attendanceKey(owner), 'list'],
    queryFn: () => listAttendance(need(source)),
    enabled: source !== null,
  })
}

/** A change to attendance. Afterwards every attendance view reloads (the plan doesn't depend on it). */
export function useAttendanceMutation<Variables>(run: (source: DataSource, variables: Variables) => Promise<void>) {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: Variables) => run(need(source), variables),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: attendanceKey(owner) })
    },
  })
}

/** The class times of the student's subjects, from the routine's class blocks. */
export function useClassSlots(): ClassSlot[] {
  const routine = useRoutine()
  const subjects = useSubjects()
  return classSlots(routine.data ?? [], new Set((subjects.data ?? []).map((subject) => subject.id)))
}

/** The attendance minimum (%) and the last day of classes, from the settings. */
export function useAttendanceSettings() {
  const profile = useProfile()
  return readSettings(profile.data?.settings).attendance
}
