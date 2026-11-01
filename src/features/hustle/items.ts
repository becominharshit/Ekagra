import { useQuery } from '@tanstack/react-query'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Json, Tables, TablesUpdate } from '@/types/database'
import type { Hustle } from './hustles'
import { hustlesKey } from './hustles'
import { byPosition, type PositionUpdate } from './ordering'
import { TEMPLATES, toHustleType } from './templates'

// Cards on a hustle's pipeline board (hustle_items), in Supabase or (Demo Mode) on the device.

export type HustleItem = Tables<'hustle_items'>

export interface ItemFields {
  title: string
  amount: number | null
  /** ISO timestamp or null. */
  dueAt: string | null
  url: string | null
  notes: string | null
  clientId: string | null
}

/** A card's notes live in its `data` (a JSON object). */
export function itemNotes(item: Pick<HustleItem, 'data'>): string {
  const data = item.data
  return data !== null && typeof data === 'object' && !Array.isArray(data) && typeof data.notes === 'string' ? data.notes : ''
}

function withNotes(data: Json, notes: string | null): Json {
  const base = data !== null && typeof data === 'object' && !Array.isArray(data) ? data : {}
  return { ...base, notes: notes?.trim() || null }
}

/** The cards of each column, in order. Cards in a column the board no longer has go to the first one. */
export function boardColumns(stages: string[], items: HustleItem[]): Map<string, HustleItem[]> {
  const columns = new Map(stages.map((stage) => [stage, [] as HustleItem[]]))
  const first = stages[0]
  for (const item of items) {
    const column = columns.get(item.stage) ?? (first === undefined ? undefined : columns.get(first))
    column?.push(item)
  }
  for (const column of columns.values()) column.sort(byPosition)
  return columns
}

/** The cards with moves applied that are still being saved, so the board shows them right away. */
export function applyMoves(items: HustleItem[], updates: PositionUpdate[]): HustleItem[] {
  if (updates.length === 0) return items
  const changes = new Map(updates.map((update) => [update.id, update]))
  return items.map((item) => {
    const change = changes.get(item.id)
    return change ? { ...item, order_index: change.order_index, stage: change.stage ?? item.stage } : item
  })
}

export async function listItems(source: DataSource, hustleId: string): Promise<HustleItem[]> {
  if (source.kind === 'demo') return demoDb.list('hustle_items').filter((item) => item.hustle_id === hustleId)
  const { data, error } = await source.client.from('hustle_items').select('*').eq('hustle_id', hustleId)
  if (error) throw dbError(error)
  return data
}

/** Adds a card at the end of a column. Its kind follows the hustle's type (order, content, …). */
export async function addItem(
  source: DataSource,
  { hustle, stage, fields, after }: { hustle: Hustle; stage: string; fields: ItemFields; after: number | null },
): Promise<void> {
  const row = {
    hustle_id: hustle.id,
    kind: TEMPLATES[toHustleType(hustle.type)].itemKind,
    title: fields.title.trim(),
    stage,
    order_index: after === null ? 1 : after + 1,
    client_id: fields.clientId,
    amount: fields.amount,
    currency: hustle.currency,
    due_at: fields.dueAt,
    url: fields.url?.trim() || null,
    data: withNotes({}, fields.notes),
  }
  if (source.kind === 'demo') {
    demoDb.insert('hustle_items', [row])
    return
  }
  const { error } = await source.client.from('hustle_items').insert(row)
  if (error) throw dbError(error)
}

export async function updateItem(source: DataSource, { item, fields }: { item: HustleItem; fields: ItemFields }): Promise<void> {
  const patch: TablesUpdate<'hustle_items'> = {
    title: fields.title.trim(),
    amount: fields.amount,
    due_at: fields.dueAt,
    url: fields.url?.trim() || null,
    client_id: fields.clientId,
    data: withNotes(item.data, fields.notes),
  }
  if (source.kind === 'demo') {
    demoDb.update('hustle_items', item.id, patch)
    return
  }
  const { error } = await source.client.from('hustle_items').update(patch).eq('id', item.id)
  if (error) throw dbError(error)
}

/** Saves moved cards: usually just one new position (see ordering.ts). */
export async function moveItems(source: DataSource, updates: PositionUpdate[]): Promise<void> {
  for (const { id, ...patch } of updates) {
    if (source.kind === 'demo') demoDb.update('hustle_items', id, patch)
    else {
      const { error } = await source.client.from('hustle_items').update(patch).eq('id', id)
      if (error) throw dbError(error)
    }
  }
}

export async function deleteItem(source: DataSource, id: string): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.remove('hustle_items', [id])
    return
  }
  const { error } = await source.client.from('hustle_items').delete().eq('id', id)
  if (error) throw dbError(error)
}

export function useHustleItems(hustleId: string) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...hustlesKey(owner), 'items', hustleId],
    queryFn: () => listItems(need(source), hustleId),
    enabled: source !== null,
  })
}
