import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { stubLocalStorage } from '@/test/memoryStorage'
import { blankLog, PROGRAMS, readExercises } from './programs'
import { deleteWorkout, listWorkouts, saveWorkout, type WorkoutInput } from './workoutsData'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }

describe('workouts in Demo Mode', () => {
  it('saves only the sets that were done, newest first, and deletes', async () => {
    const day = PROGRAMS.hostel.days[0] ?? { key: 'A', title: 'Push', exercises: [] }
    const log = blankLog(day)
    log[0] = { ...log[0], name: log[0]?.name ?? '', kind: 'reps', sets: [{ reps: 12, seconds: null, kg: null }, { reps: 10, seconds: null, kg: null }, { reps: null, seconds: null, kg: null }] }
    const input: WorkoutInput = { date: '2026-11-02', title: 'Hostel A: Push and core', program: 'hostel', dayKey: 'A', exercises: log, durationMin: 28, notes: ' ' }
    await saveWorkout(DEMO, input)
    await saveWorkout(DEMO, { ...input, date: '2026-11-04', dayKey: 'B', title: 'Hostel B' })
    const [newest, older] = await listWorkouts(DEMO, '2026-11-01')
    expect([newest?.title, older?.title]).toEqual(['Hostel B', 'Hostel A: Push and core'])
    expect(readExercises(older?.exercises)).toEqual([{ name: 'Push-ups', kind: 'reps', sets: [{ reps: 12, seconds: null, kg: null }, { reps: 10, seconds: null, kg: null }] }])
    expect(older).toMatchObject({ program: 'hostel', day_key: 'A', duration_min: 28, notes: null })

    await deleteWorkout(DEMO, newest?.id ?? '')
    expect(await listWorkouts(DEMO, '2026-11-01')).toHaveLength(1)
  })

  it('needs at least one set done', async () => {
    const day = PROGRAMS.gym.days[0] ?? { key: 'A', title: 'Push', exercises: [] }
    await expect(saveWorkout(DEMO, { date: '2026-11-02', title: 'Gym A', program: 'gym', dayKey: 'A', exercises: blankLog(day), durationMin: null, notes: '' })).rejects.toThrow(/at least one set/)
  })
})
