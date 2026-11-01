import { useQuery } from '@tanstack/react-query'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Tables } from '@/types/database'
import { hustlesKey } from './hustles'

// A hustle's clients (or students, for tutoring), in Supabase or (Demo Mode) on the device.

export type Client = Tables<'clients'>

export interface ClientFields {
  name: string
  platform: string | null
  contact: string | null
  notes: string | null
}

const clean = (fields: ClientFields) => ({
  name: fields.name.trim(),
  platform: fields.platform?.trim() || null,
  contact: fields.contact?.trim() || null,
  notes: fields.notes?.trim() || null,
})

export async function listClients(source: DataSource, hustleId: string): Promise<Client[]> {
  const byName = (a: Client, b: Client) => a.name.localeCompare(b.name)
  if (source.kind === 'demo') return demoDb.list('clients').filter((client) => client.hustle_id === hustleId).sort(byName)
  const { data, error } = await source.client.from('clients').select('*').eq('hustle_id', hustleId)
  if (error) throw dbError(error)
  return data.sort(byName)
}

/** Adds a client to a hustle (no `id`) or changes one. */
export async function saveClient(source: DataSource, { hustleId, id, fields }: { hustleId: string; id: string | null; fields: ClientFields }): Promise<void> {
  const values = clean(fields)
  if (source.kind === 'demo') {
    if (id) demoDb.update('clients', id, values)
    else demoDb.insert('clients', [{ ...values, hustle_id: hustleId }])
    return
  }
  const { error } = id
    ? await source.client.from('clients').update(values).eq('id', id)
    : await source.client.from('clients').insert({ ...values, hustle_id: hustleId })
  if (error) throw dbError(error)
}

/** Deletes a client. Their cards, money and time stay, without the name. */
export async function deleteClient(source: DataSource, id: string): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.remove('clients', [id])
    return
  }
  const { error } = await source.client.from('clients').delete().eq('id', id)
  if (error) throw dbError(error)
}

export function useClients(hustleId: string) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...hustlesKey(owner), 'clients', hustleId],
    queryFn: () => listClients(need(source), hustleId),
    enabled: source !== null,
  })
}
