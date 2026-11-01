import { describe, expect, it } from 'vitest'
import { blankLog, doneExercises, nextProgramDay, personalBests, PROGRAMS, readExercises, specLabel, workoutsPerWeek } from './programs'

const logged = (date: string, dayKey: string | null, program: string | null = 'hostel') => ({ date, day_key: dayKey, program, created_at: `${date}T10:00:00.000Z` })

describe('programs', () => {
  it('have days with exercises, sets and targets', () => {
    for (const program of Object.values(PROGRAMS)) {
      expect(program.days.length).toBeGreaterThanOrEqual(2)
      for (const day of program.days) expect(day.exercises.length).toBeGreaterThanOrEqual(4)
    }
    expect(specLabel(PROGRAMS.hostel.days[0]?.exercises[0] ?? { sets: 0, target: '' })).toBe('3 × 8–15')
  })

  it('go round the days: the next one follows the last workout logged with the program', () => {
    const hostel = PROGRAMS.hostel
    expect(nextProgramDay(hostel, []).key).toBe('A')
    expect(nextProgramDay(hostel, [logged('2026-11-02', 'A')]).key).toBe('B')
    expect(nextProgramDay(hostel, [logged('2026-11-02', 'A'), logged('2026-11-04', 'C')]).key).toBe('A')
    // Other programs and workouts of your own don't count.
    expect(nextProgramDay(hostel, [logged('2026-11-02', 'A'), logged('2026-11-05', 'B', 'gym'), logged('2026-11-06', null, null)]).key).toBe('B')
  })
})

describe('logging', () => {
  it('starts with an empty set for each planned set, and keeps only the sets done', () => {
    const blank = blankLog(PROGRAMS.hostel.days[0] ?? { key: 'A', title: '', exercises: [] })
    expect(blank[0]).toEqual({ name: 'Push-ups', kind: 'reps', sets: [{ reps: null, seconds: null, kg: null }, { reps: null, seconds: null, kg: null }, { reps: null, seconds: null, kg: null }] })
    const filled = [
      { name: 'Push-ups', kind: 'reps' as const, sets: [{ reps: 12, seconds: null, kg: null }, { reps: null, seconds: null, kg: null }] },
      { name: 'Plank', kind: 'seconds' as const, sets: [{ reps: null, seconds: 40, kg: null }] },
      { name: 'Chair dips', kind: 'reps' as const, sets: [{ reps: 0, seconds: null, kg: null }] },
    ]
    expect(doneExercises(filled).map((exercise) => [exercise.name, exercise.sets.length])).toEqual([
      ['Push-ups', 1],
      ['Plank', 1],
    ])
  })

  it('reads saved exercises back, leaving out broken ones', () => {
    expect(readExercises([{ name: 'Squat', kind: 'reps', sets: [{ reps: 8, kg: 60 }, 'oops'] }, { kind: 'reps' }, 'nonsense'])).toEqual([
      { name: 'Squat', kind: 'reps', sets: [{ reps: 8, seconds: null, kg: 60 }] },
    ])
  })
})

describe('progress', () => {
  it("finds each exercise's heaviest set, most reps and longest hold", () => {
    const workouts = [
      { exercises: [{ name: 'Squat', kind: 'reps', sets: [{ reps: 8, kg: 60 }, { reps: 10, kg: 50 }] }] },
      { exercises: [{ name: 'Squat', kind: 'reps', sets: [{ reps: 6, kg: 65 }] }, { name: 'Plank', kind: 'seconds', sets: [{ seconds: 45 }] }] },
    ]
    expect(personalBests(workouts)).toEqual([
      { name: 'Plank', kg: null, reps: null, seconds: 45 },
      { name: 'Squat', kg: 65, reps: 10, seconds: null },
    ])
  })

  it('counts workouts per week, Monday to Sunday', () => {
    const weeks = workoutsPerWeek([{ date: '2026-10-27' }, { date: '2026-11-02' }, { date: '2026-11-04' }, { date: '2026-11-09' }], '2026-11-08', 3)
    expect(weeks).toEqual([
      { weekStart: '2026-10-19', count: 0 },
      { weekStart: '2026-10-26', count: 1 },
      { weekStart: '2026-11-02', count: 2 },
    ])
  })
})
