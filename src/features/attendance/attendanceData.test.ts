import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { addClass, deleteAttendance, listAttendance, markClass, setAttendanceStatus, unmarkClass } from './attendanceData'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }

function subject(): string {
  const [row] = demoDb.insert('subjects', [{ name: 'DBMS' }])
  if (!row) throw new Error('no subject')
  return row.id
}

describe('attendance in Demo Mode', () => {
  it('keeps one row per class from the routine: marking again changes it, unmarking removes it', async () => {
    const subjectId = subject()
    await markClass(DEMO, { subjectId, date: '2026-11-02', start: '09:00', status: 'present' })
    await markClass(DEMO, { subjectId, date: '2026-11-02', start: '09:00', status: 'absent' })
    await markClass(DEMO, { subjectId, date: '2026-11-02', start: '14:00', status: 'present' })
    expect((await listAttendance(DEMO)).map((row) => [row.start_time, row.status])).toEqual([
      ['14:00:00', 'present'],
      ['09:00:00', 'absent'],
    ])

    await unmarkClass(DEMO, { subjectId, date: '2026-11-02', start: '09:00' })
    expect((await listAttendance(DEMO)).map((row) => row.start_time)).toEqual(['14:00:00'])
  })

  it('adds classes by hand without a time, changes and deletes them, newest first', async () => {
    const subjectId = subject()
    await addClass(DEMO, { subjectId, date: '2026-11-03', status: 'present' })
    await addClass(DEMO, { subjectId, date: '2026-11-05', status: 'present' })
    const [newest, older] = await listAttendance(DEMO)
    expect([newest?.date, older?.date]).toEqual(['2026-11-05', '2026-11-03'])
    expect(newest?.start_time).toBeNull()

    await setAttendanceStatus(DEMO, { id: older?.id ?? '', status: 'cancelled' })
    await deleteAttendance(DEMO, newest?.id ?? '')
    expect((await listAttendance(DEMO)).map((row) => row.status)).toEqual(['cancelled'])
  })

  it("deletes a subject's attendance with the subject", async () => {
    const subjectId = subject()
    await addClass(DEMO, { subjectId, date: '2026-11-03', status: 'present' })
    demoDb.remove('subjects', [subjectId])
    expect(await listAttendance(DEMO)).toEqual([])
  })
})
