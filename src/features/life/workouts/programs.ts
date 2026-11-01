import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import type { Tables } from '@/types/database'

// Workout programs for students, no AI: a hostel room with no equipment, a pair of dumbbells, or a
// gym. Each is a rotation of days (A, B, C…) on the weekdays the student picks; the next workout
// is the day after the last one logged. Logs keep the sets done (reps or seconds, and kg for
// weights), which give personal bests and workouts per week. Pure functions, tested on their own.

export type Workout = Tables<'workouts'>

export const PROGRAM_KEYS = ['hostel', 'dumbbell', 'gym'] as const
export type ProgramKey = (typeof PROGRAM_KEYS)[number]

export interface ExerciseSpec {
  name: string
  sets: number
  /** What to aim for, e.g. "8–12" or "30–45 s". */
  target: string
  kind: 'reps' | 'seconds'
  /** Uses weights: kg is logged too. */
  weighted: boolean
}

export interface ProgramDay {
  key: string
  title: string
  exercises: ExerciseSpec[]
}

export interface Program {
  key: ProgramKey
  title: string
  description: string
  /** The weekdays it suggests (0 = Sunday … 6 = Saturday). */
  weekdays: number[]
  days: ProgramDay[]
}

const reps = (name: string, sets: number, target: string, weighted = false): ExerciseSpec => ({ name, sets, target, kind: 'reps', weighted })
const hold = (name: string, sets: number, target: string): ExerciseSpec => ({ name, sets, target, kind: 'seconds', weighted: false })

export const PROGRAMS: Record<ProgramKey, Program> = {
  hostel: {
    key: 'hostel',
    title: 'Hostel room (no equipment)',
    description: 'Bodyweight only, in the space next to your bed. 3 days a week, about 30 minutes.',
    weekdays: [1, 3, 5],
    days: [
      {
        key: 'A',
        title: 'Push and core',
        exercises: [reps('Push-ups', 3, '8–15'), reps('Pike push-ups', 3, '6–10'), reps('Chair dips', 3, '8–12'), hold('Plank', 3, '30–45 s'), hold('Mountain climbers', 3, '30 s')],
      },
      {
        key: 'B',
        title: 'Legs and back',
        exercises: [reps('Squats', 3, '15–20'), reps('Reverse lunges (each leg)', 3, '10'), reps('Glute bridges', 3, '15'), hold('Superman hold', 3, '20–30 s'), hold('Wall sit', 3, '30–45 s')],
      },
      {
        key: 'C',
        title: 'Full body',
        exercises: [reps('Burpees', 3, '8–12'), reps('Jump squats', 3, '10–15'), reps('Diamond push-ups', 3, '6–10'), reps('Towel rows (door)', 3, '8–12'), hold('Side plank (each side)', 3, '20–30 s')],
      },
    ],
  },
  dumbbell: {
    key: 'dumbbell',
    title: 'A pair of dumbbells',
    description: 'Upper and lower body on alternate days. 4 days a week, about 40 minutes.',
    weekdays: [1, 2, 4, 5],
    days: [
      {
        key: 'A',
        title: 'Upper body',
        exercises: [
          reps('Floor press', 3, '8–12', true),
          reps('One-arm row (each arm)', 3, '10', true),
          reps('Shoulder press', 3, '8–12', true),
          reps('Biceps curls', 3, '10–12', true),
          reps('Overhead triceps extension', 3, '10–12', true),
        ],
      },
      {
        key: 'B',
        title: 'Lower body and core',
        exercises: [
          reps('Goblet squat', 3, '10–12', true),
          reps('Romanian deadlift', 3, '10–12', true),
          reps('Reverse lunges (each leg)', 3, '10', true),
          reps('Calf raises', 3, '15', true),
          reps('Russian twists', 3, '20'),
        ],
      },
    ],
  },
  gym: {
    key: 'gym',
    title: 'Gym (push, pull, legs)',
    description: 'The classic split with barbells and machines. 3 days a week, about 50 minutes.',
    weekdays: [1, 3, 5],
    days: [
      {
        key: 'A',
        title: 'Push',
        exercises: [
          reps('Bench press', 4, '6–10', true),
          reps('Overhead press', 3, '8–10', true),
          reps('Incline dumbbell press', 3, '10–12', true),
          reps('Lateral raises', 3, '12–15', true),
          reps('Triceps pushdown', 3, '10–12', true),
        ],
      },
      {
        key: 'B',
        title: 'Pull',
        exercises: [
          reps('Lat pulldown', 4, '8–12', true),
          reps('Seated cable row', 3, '10–12', true),
          reps('Face pulls', 3, '12–15', true),
          reps('Barbell curls', 3, '10–12', true),
          reps('Back extensions', 3, '12–15'),
        ],
      },
      {
        key: 'C',
        title: 'Legs',
        exercises: [
          reps('Squat', 4, '6–10', true),
          reps('Romanian deadlift', 3, '8–10', true),
          reps('Leg press', 3, '10–12', true),
          reps('Leg curl', 3, '10–12', true),
          reps('Calf raises', 3, '12–15', true),
        ],
      },
    ],
  },
}

export function toProgramKey(value: string | null | undefined): ProgramKey | null {
  return value && (PROGRAM_KEYS as readonly string[]).includes(value) ? (value as ProgramKey) : null
}

/** A logged exercise: the sets done. A type (not an interface) so it can be saved as JSON. */
export type LoggedSet = { reps: number | null; seconds: number | null; kg: number | null }
export type LoggedExercise = { name: string; kind: 'reps' | 'seconds'; sets: LoggedSet[] }

/** A workout's saved exercises; broken entries are left out. */
export function readExercises(json: unknown): LoggedExercise[] {
  if (!Array.isArray(json)) return []
  const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null)
  return json.flatMap((item): LoggedExercise[] => {
    if (typeof item !== 'object' || item === null) return []
    const { name, kind, sets } = item as Record<string, unknown>
    if (typeof name !== 'string' || !Array.isArray(sets)) return []
    return [
      {
        name,
        kind: kind === 'seconds' ? 'seconds' : 'reps',
        sets: sets.flatMap((set) => {
          if (typeof set !== 'object' || set === null) return []
          const values = set as Record<string, unknown>
          return [{ reps: number(values.reps), seconds: number(values.seconds), kg: number(values.kg) }]
        }),
      },
    ]
  })
}

/** The next day of the program: the one after the last workout logged with it (the first at the start). */
export function nextProgramDay(program: Program, workouts: Pick<Workout, 'program' | 'day_key' | 'date' | 'created_at'>[]): ProgramDay {
  const last = workouts
    .filter((workout) => workout.program === program.key && workout.day_key)
    .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))[0]
  const index = last ? program.days.findIndex((day) => day.key === last.day_key) : -1
  return program.days[(index + 1) % program.days.length] ?? program.days[0] ?? { key: 'A', title: 'Workout', exercises: [] }
}

/** Empty sets to fill in, one per planned set. */
export function blankLog(day: ProgramDay): LoggedExercise[] {
  return day.exercises.map((exercise) => ({
    name: exercise.name,
    kind: exercise.kind,
    sets: Array.from({ length: exercise.sets }, () => ({ reps: null, seconds: null, kg: null })),
  }))
}

/** Only the sets that were done (with reps or seconds), and the exercises that have any. */
export function doneExercises(log: LoggedExercise[]): LoggedExercise[] {
  return log
    .map((exercise) => ({ ...exercise, sets: exercise.sets.filter((set) => (exercise.kind === 'seconds' ? (set.seconds ?? 0) > 0 : (set.reps ?? 0) > 0)) }))
    .filter((exercise) => exercise.sets.length > 0)
}

export interface PersonalBest {
  name: string
  /** Heaviest set (kg), most reps in one set, or longest hold (seconds). */
  kg: number | null
  reps: number | null
  seconds: number | null
}

/** Each exercise's best: the heaviest weight, the most reps in a set, the longest hold. */
export function personalBests(workouts: Pick<Workout, 'exercises'>[]): PersonalBest[] {
  const best = new Map<string, PersonalBest>()
  for (const workout of workouts) {
    for (const exercise of readExercises(workout.exercises)) {
      const current = best.get(exercise.name) ?? { name: exercise.name, kg: null, reps: null, seconds: null }
      for (const set of exercise.sets) {
        const higher = (a: number | null, b: number | null) => (b === null || b <= 0 ? a : a === null ? b : Math.max(a, b))
        current.kg = higher(current.kg, set.kg)
        current.reps = higher(current.reps, set.reps)
        current.seconds = higher(current.seconds, set.seconds)
      }
      best.set(exercise.name, current)
    }
  }
  return [...best.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Workouts per week for the last `weeks` weeks (Monday to Sunday), oldest first. */
export function workoutsPerWeek(workouts: Pick<Workout, 'date'>[], today: string, weeks = 8): { weekStart: string; count: number }[] {
  const thisWeek = startOfWeek(parseISO(today), { weekStartsOn: 1 })
  return Array.from({ length: weeks }, (_, index) => {
    const start = addDays(thisWeek, -7 * (weeks - 1 - index))
    const from = format(start, 'yyyy-MM-dd')
    const to = format(addDays(start, 6), 'yyyy-MM-dd')
    return { weekStart: from, count: workouts.filter((workout) => workout.date >= from && workout.date <= to).length }
  })
}

/** "3 × 8–12" or "3 × 30–45 s". */
export function specLabel(exercise: Pick<ExerciseSpec, 'sets' | 'target'>): string {
  return `${exercise.sets} × ${exercise.target}`
}
