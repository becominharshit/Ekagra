import { useQuery } from '@tanstack/react-query'
import { localToIso } from '@/features/planner/schedule'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Tables } from '@/types/database'
import { hustlesKey } from './hustles'

// Hours spent on a hustle (time_entries): added by hand, or by focus sessions on hustle blocks.
// In Supabase or (Demo Mode) on the device.

export type TimeEntry = Tables<'time_entries'>

export interface ManualTime {
  /** 'YYYY-MM-DD' */
  date: string
  minutes: number
  clientId: string | null
  note: string | null
}

const newestFirst = (a: TimeEntry, b: TimeEntry) => b.started_at.localeCompare(a.started_at)

export async function listTimeEntries(source: DataSource, hustleId: string): Promise<TimeEntry[]> {
  if (source.kind === 'demo') return demoDb.list('time_entries').filter((entry) => entry.hustle_id === hustleId).sort(newestFirst)
  const { data, error } = await source.client.from('time_entries').select('*').eq('hustle_id', hustleId)
  if (error) throw dbError(error)
  return data.sort(newestFirst)
}

async function insertEntry(source: DataSource, row: Omit<Tables<'time_entries'>, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.insert('time_entries', [row])
    return
  }
  const { error } = await source.client.from('time_entries').insert(row)
  if (error) throw dbError(error)
}

/** Time added by hand. It is dated at noon that day in `timeZone`, so it stays on that day in any time zone. */
export function addManualTime(
  source: DataSource,
  { hustleId, fields, timeZone }: { hustleId: string; fields: ManualTime; timeZone?: string },
): Promise<void> {
  return insertEntry(source, {
    hustle_id: hustleId,
    client_id: fields.clientId,
    focus_session_id: null,
    started_at: localToIso(fields.date, 12 * 60, timeZone),
    ended_at: null,
    minutes: Math.round(fields.minutes),
    source: 'manual',
    note: fields.note?.trim() || null,
  })
}

/** Time from a focus session on a hustle block. Nothing is saved for less than a minute. */
export async function addFocusTime(
  source: DataSource,
  { hustleId, sessionId, startedAt, endedAt, minutes }: { hustleId: string; sessionId: string; startedAt: string; endedAt: string; minutes: number },
): Promise<void> {
  if (Math.round(minutes) < 1) return
  await insertEntry(source, {
    hustle_id: hustleId,
    client_id: null,
    focus_session_id: sessionId,
    started_at: startedAt,
    ended_at: endedAt,
    minutes: Math.round(minutes),
    source: 'focus',
    note: null,
  })
}

export async function deleteTimeEntry(source: DataSource, id: string): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.remove('time_entries', [id])
    return
  }
  const { error } = await source.client.from('time_entries').delete().eq('id', id)
  if (error) throw dbError(error)
}

export function useTimeEntries(hustleId: string) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...hustlesKey(owner), 'time', hustleId],
    queryFn: () => listTimeEntries(need(source), hustleId),
    enabled: source !== null,
  })
}
