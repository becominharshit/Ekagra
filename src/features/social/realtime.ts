import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { socialKey } from './socialData'

// Supabase Realtime for partners and groups: the database sends a change as it happens, to the
// students the rules let see that row (migration 008 adds these tables to Realtime). The app then
// reloads only what changed. Signed in only: Demo Mode's friends are samples.

export type SocialPart = 'stats' | 'nudges' | 'groups'

/** The changes listened to, and which part of the screens each one changes. */
export function socialChanges(userId: string): { table: 'shared_stats' | 'nudges' | 'group_sessions' | 'group_members'; filter?: string; part: SocialPart }[] {
  return [
    // A partner's or group mate's numbers, or "studying now".
    { table: 'shared_stats', part: 'stats' },
    // A nudge for this student (or one marked seen).
    { table: 'nudges', filter: `to_user_id=eq.${userId}`, part: 'nudges' },
    // A group focus starting or ending, someone joining or leaving.
    { table: 'group_sessions', part: 'groups' },
    { table: 'group_members', part: 'groups' },
  ]
}

/** The queries to reload for these parts. */
export function keysFor(parts: ReadonlySet<SocialPart>, owner: string | null): (readonly unknown[])[] {
  const keys: (readonly unknown[])[] = []
  if (parts.has('stats')) keys.push([...socialKey(owner), 'partners'], [...socialKey(owner), 'mine'])
  if (parts.has('stats') || parts.has('groups')) keys.push([...socialKey(owner), 'groups'])
  if (parts.has('nudges')) keys.push([...socialKey(owner), 'nudges'])
  return keys
}

type Client = Pick<SupabaseClient<Database>, 'channel' | 'removeChannel'>

/** Listens to the social changes; returns how to stop. */
export function listenToSocial(client: Client, userId: string, onChange: (part: SocialPart) => void): () => void {
  let channel = client.channel(`social-${userId}`)
  for (const change of socialChanges(userId)) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: change.table, ...(change.filter ? { filter: change.filter } : {}) }, () => onChange(change.part))
  }
  channel.subscribe()
  return () => {
    void client.removeChannel(channel)
  }
}
