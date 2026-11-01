import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dbError, need, readAll, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { habitProblem, type Habit, type HabitInput, type HabitLog } from './habits'

// Habits and their daily log, saved in Supabase or (Demo Mode) on the device. One log per habit
// and day: logging again changes it.

/** Every Life query key starts with this, so one refresh after a change updates them all. */
export const lifeKey = (owner: string | null) => ['life', owner] as const

const byOrder = (a: Habit, b: Habit) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at)

export async function listHabits(source: DataSource): Promise<Habit[]> {
  if (source.kind === 'demo') return demoDb.list('habits').filter((habit) => habit.archived_at === null).sort(byOrder)
  const { data, error } = await source.client.from('habits').select('*').eq('user_id', source.userId).is('archived_at', null)
  if (error) throw dbError(error)
  return data.sort(byOrder)
}

/** Logs from `since` ('YYYY-MM-DD') on. */
export async function listHabitLogs(source: DataSource, since: string): Promise<HabitLog[]> {
  if (source.kind === 'demo') return demoDb.list('habit_logs').filter((log) => log.date >= since)
  return readAll((from, to) => source.client.from('habit_logs').select('*').eq('user_id', source.userId).gte('date', since).order('id').range(from, to))
}

/** Adds a habit, or changes one (with `id`). */
export async function saveHabit(source: DataSource, { id, ...input }: HabitInput & { id?: string }): Promise<void> {
  const problem = habitProblem(input)
  if (problem) throw new Error(problem)
  const row = {
    title: input.title.trim(),
    kind: input.kind,
    days_of_week: [...new Set(input.days)].sort((a, b) => a - b),
    target: input.target,
    unit: input.target === null ? null : input.unit?.trim() || null,
  }
  if (source.kind === 'demo') {
    if (id) demoDb.update('habits', id, row)
    else demoDb.insert('habits', [{ ...row, order_index: demoDb.list('habits').length }])
    return
  }
  if (id) {
    const { error } = await source.client.from('habits').update(row).eq('id', id)
    if (error) throw dbError(error)
    return
  }
  const { count, error: countError } = await source.client.from('habits').select('id', { count: 'exact', head: true }).eq('user_id', source.userId)
  if (countError) throw dbError(countError)
  const { error } = await source.client.from('habits').insert({ ...row, order_index: count ?? 0 })
  if (error) throw dbError(error)
}

/** Hides a habit (its log stays, so it could come back). */
export async function archiveHabit(source: DataSource, id: string): Promise<void> {
  const patch = { archived_at: new Date().toISOString() }
  if (source.kind === 'demo') {
    demoDb.update('habits', id, patch)
    return
  }
  const { error } = await source.client.from('habits').update(patch).eq('id', id)
  if (error) throw dbError(error)
}

/** Sets a day's log: ticked or not, or a count (8 glasses). */
export async function logHabit(source: DataSource, { habitId, date, done, value }: { habitId: string; date: string; done: boolean; value: number }): Promise<void> {
  const row = { habit_id: habitId, date, done, value: Math.max(0, value) }
  if (source.kind === 'demo') {
    const existing = demoDb.list('habit_logs').find((log) => log.habit_id === habitId && log.date === date)
    if (existing) demoDb.update('habit_logs', existing.id, row)
    else demoDb.insert('habit_logs', [row])
    return
  }
  const { error } = await source.client.from('habit_logs').upsert({ ...row, user_id: source.userId }, { onConflict: 'user_id,habit_id,date' })
  if (error) throw dbError(error)
}

export function useHabits() {
  const { source, owner } = useDataSource()
  return useQuery({ queryKey: [...lifeKey(owner), 'habits'], queryFn: () => listHabits(need(source)), enabled: source !== null })
}

export function useHabitLogs(since: string) {
  const { source, owner } = useDataSource()
  return useQuery({ queryKey: [...lifeKey(owner), 'habit-logs', since], queryFn: () => listHabitLogs(need(source), since), enabled: source !== null })
}

/** A change to Life data. Afterwards every Life view reloads. */
export function useLifeMutation<Variables>(run: (source: DataSource, variables: Variables) => Promise<void>) {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: Variables) => run(need(source), variables),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: lifeKey(owner) })
    },
  })
}
