import { describe, expect, it, vi } from 'vitest'
import { keysFor, listenToSocial, type SocialPart } from './realtime'

/** A stand-in for supabase.channel(...).on(...).subscribe(), recording what was asked. */
function fakeClient() {
  const listeners: { filter: Record<string, string>; callback: () => void }[] = []
  const channel = {
    on: (_type: string, filter: Record<string, string>, callback: () => void) => {
      listeners.push({ filter, callback })
      return channel
    },
    subscribe: vi.fn(() => channel),
  }
  const client = { channel: vi.fn(() => channel), removeChannel: vi.fn(async () => 'ok' as const) }
  return { client, channel, listeners }
}

describe('Realtime for partners and groups', () => {
  it("listens to shared numbers, this student's nudges and group changes, and stops cleanly", () => {
    const { client, channel, listeners } = fakeClient()
    const changes: SocialPart[] = []
    const stop = listenToSocial(client as never, 'me', (part) => changes.push(part))
    expect(client.channel).toHaveBeenCalledWith('social-me')
    expect(listeners.map((listener) => listener.filter)).toEqual([
      { event: '*', schema: 'public', table: 'shared_stats' },
      { event: '*', schema: 'public', table: 'nudges', filter: 'to_user_id=eq.me' },
      { event: '*', schema: 'public', table: 'group_sessions' },
      { event: '*', schema: 'public', table: 'group_members' },
    ])
    expect(channel.subscribe).toHaveBeenCalledOnce()
    listeners[1]?.callback()
    listeners[3]?.callback()
    expect(changes).toEqual(['nudges', 'groups'])
    stop()
    expect(client.removeChannel).toHaveBeenCalledWith(channel)
  })

  it('reloads only what changed', () => {
    expect(keysFor(new Set<SocialPart>(['nudges']), 'u1')).toEqual([['social', 'u1', 'nudges']])
    expect(keysFor(new Set<SocialPart>(['stats']), 'u1')).toEqual([
      ['social', 'u1', 'partners'],
      ['social', 'u1', 'mine'],
      ['social', 'u1', 'groups'],
    ])
    expect(keysFor(new Set<SocialPart>(['groups']), 'u1')).toEqual([['social', 'u1', 'groups']])
  })
})
