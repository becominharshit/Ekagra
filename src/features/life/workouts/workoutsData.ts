import { useQuery } from '@tanstack/react-query'
import { dbError, need, readAll, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { lifeKey } from '../lifeData'
import { doneExercises, type LoggedExercise, type ProgramKey, type Workout } from './programs'

// Logged workouts, saved in Supabase or (Demo Mode) on the device.

const newestFirst = (a: Workout, b: Workout) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)

/** Workouts from `since` ('YYYY-MM-DD') on, newest first. */
export async function listWorkouts(source: DataSource, since: string): Promise<Workout[]> {
  if (source.kind === 'demo') return demoDb.list('workouts').filter((workout) => workout.date >= since).sort(newestFirst)
  const rows = await readAll((from, to) => source.client.from('workouts').select('*').eq('user_id', source.userId).gte('date', since).order('id').range(from, to))
  return rows.sort(newestFirst)
}

export interface WorkoutInput {
  date: string
  title: string
  program: ProgramKey | null
  dayKey: string | null
  exercises: LoggedExercise[]
  durationMin: number | null
  notes: string
}

/** Why a workout can't be saved, in plain words; null when it's fine. */
export function workoutProblem(input: WorkoutInput): string | null {
  if (!input.title.trim()) return 'Give the workout a name.'
  if (doneExercises(input.exercises).length === 0) return 'Fill in at least one set (reps or seconds).'
  if (input.durationMin !== null && (!Number.isInteger(input.durationMin) || input.durationMin < 1 || input.durationMin > 600)) return 'The time is between 1 and 600 minutes.'
  return null
}

/** Saves a workout with only the sets that were done. */
export async function saveWorkout(source: DataSource, input: WorkoutInput): Promise<void> {
  const problem = workoutProblem(input)
  if (problem) throw new Error(problem)
  const row = {
    date: input.date,
    title: input.title.trim().slice(0, 80),
    program: input.program,
    day_key: input.dayKey,
    exercises: doneExercises(input.exercises),
    duration_min: input.durationMin,
    notes: input.notes.trim().slice(0, 1000) || null,
  }
  if (source.kind === 'demo') {
    demoDb.insert('workouts', [row])
    return
  }
  const { error } = await source.client.from('workouts').insert(row)
  if (error) throw dbError(error)
}

export async function deleteWorkout(source: DataSource, id: string): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.remove('workouts', [id])
    return
  }
  const { error } = await source.client.from('workouts').delete().eq('id', id)
  if (error) throw dbError(error)
}

export function useWorkouts(since: string) {
  const { source, owner } = useDataSource()
  return useQuery({ queryKey: [...lifeKey(owner), 'workouts', since], queryFn: () => listWorkouts(need(source), since), enabled: source !== null })
}
