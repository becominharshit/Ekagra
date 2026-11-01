import { dbError, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { ModeSwitchEvent } from './modes'

// A confirmed switch against the plan (e.g. opening Hustle during a Study block) is saved as a
// distraction event, so the weekly stats can show when and why the plan was left.

export async function saveModeSwitch(source: DataSource, event: ModeSwitchEvent): Promise<void> {
  const row = { kind: 'mode_switch', from_mode: event.fromMode, to_mode: event.toMode, reason: event.reason, at: event.at }
  if (source.kind === 'demo') {
    demoDb.insert('distraction_events', [row])
    return
  }
  const { error } = await source.client.from('distraction_events').insert(row)
  if (error) throw dbError(error)
}
