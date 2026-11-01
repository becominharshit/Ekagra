import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, format, startOfDay } from 'date-fns'
import { dbError, need, readAll, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { healthBridge } from '@/lib/native/healthBridge'
import { lifeKey } from '../lifeData'
import { nightsFromSessions, type Night, type SleepLog, type StepCount } from './health'

// Sleep and steps, saved in Supabase or (Demo Mode) on the device: typed in, or brought in from
// Health Connect on Android. One row per day and source (manual or health_connect): saving again
// changes it.

type Source = 'manual' | 'health_connect'

/** Health Connect is read this many days back (it only gives apps the last 30 days anyway). */
export const SYNC_DAYS = 30

export async function listSleep(source: DataSource, since: string): Promise<SleepLog[]> {
  if (source.kind === 'demo') return demoDb.list('sleep_logs').filter((row) => row.date >= since)
  return readAll((from, to) => source.client.from('sleep_logs').select('*').eq('user_id', source.userId).gte('date', since).order('id').range(from, to))
}

export async function listSteps(source: DataSource, since: string): Promise<StepCount[]> {
  if (source.kind === 'demo') return demoDb.list('step_counts').filter((row) => row.date >= since)
  return readAll((from, to) => source.client.from('step_counts').select('*').eq('user_id', source.userId).gte('date', since).order('id').range(from, to))
}

const sleepRow = (night: Night, from: Source) => ({ date: night.date, bed_at: night.bedAt, wake_at: night.wakeAt, minutes: night.minutes, source: from })

/** Saves nights: each replaces that morning's night from the same source. */
export async function saveNights(source: DataSource, nights: Night[], from: Source): Promise<void> {
  const rows = nights.filter((night) => night.minutes >= 0 && night.minutes <= 1440 && night.wakeAt > night.bedAt).map((night) => sleepRow(night, from))
  if (rows.length === 0) return
  if (source.kind === 'demo') {
    for (const row of rows) {
      const existing = demoDb.list('sleep_logs').find((saved) => saved.date === row.date && saved.source === from)
      if (existing) demoDb.update('sleep_logs', existing.id, row)
      else demoDb.insert('sleep_logs', [row])
    }
    return
  }
  const { error } = await source.client.from('sleep_logs').upsert(
    rows.map((row) => ({ ...row, user_id: source.userId })),
    { onConflict: 'user_id,date,source' },
  )
  if (error) throw dbError(error)
}

/** Saves step counts: each replaces that day's count from the same source. */
export async function saveSteps(source: DataSource, days: { date: string; steps: number }[], from: Source): Promise<void> {
  const rows = days.filter((day) => Number.isInteger(day.steps) && day.steps >= 0 && day.steps <= 200_000).map((day) => ({ date: day.date, steps: day.steps, source: from }))
  if (rows.length === 0) return
  if (source.kind === 'demo') {
    for (const row of rows) {
      const existing = demoDb.list('step_counts').find((saved) => saved.date === row.date && saved.source === from)
      if (existing) demoDb.update('step_counts', existing.id, row)
      else demoDb.insert('step_counts', [row])
    }
    return
  }
  const { error } = await source.client.from('step_counts').upsert(
    rows.map((row) => ({ ...row, user_id: source.userId })),
    { onConflict: 'user_id,date,source' },
  )
  if (error) throw dbError(error)
}

export async function deleteSleep(source: DataSource, id: string): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.remove('sleep_logs', [id])
    return
  }
  const { error } = await source.client.from('sleep_logs').delete().eq('id', id)
  if (error) throw dbError(error)
}

export async function deleteSteps(source: DataSource, id: string): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.remove('step_counts', [id])
    return
  }
  const { error } = await source.client.from('step_counts').delete().eq('id', id)
  if (error) throw dbError(error)
}

/** Brings in the last 30 days of sleep and steps from Health Connect (Android, with access). */
export async function syncHealthConnect(source: DataSource, now: Date): Promise<{ nights: number; days: number }> {
  const from = startOfDay(addDays(now, 1 - SYNC_DAYS))
  // Nights that ended in the window (a night can start the evening before it).
  const [sessions, days] = await Promise.all([healthBridge.readSleep(addDays(from, -1), now), healthBridge.readSteps(format(from, 'yyyy-MM-dd'), format(now, 'yyyy-MM-dd'))])
  const nights = nightsFromSessions(sessions).filter((night) => night.date >= format(from, 'yyyy-MM-dd'))
  await saveNights(source, nights, 'health_connect')
  await saveSteps(source, days, 'health_connect')
  return { nights: nights.length, days: days.length }
}

export function useSleepLogs(since: string) {
  const { source, owner } = useDataSource()
  return useQuery({ queryKey: [...lifeKey(owner), 'sleep', since], queryFn: () => listSleep(need(source), since), enabled: source !== null })
}

export function useStepCounts(since: string) {
  const { source, owner } = useDataSource()
  return useQuery({ queryKey: [...lifeKey(owner), 'steps', since], queryFn: () => listSteps(need(source), since), enabled: source !== null })
}

export function useHealthSync() {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => syncHealthConnect(need(source), new Date()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: lifeKey(owner) })
    },
  })
}
