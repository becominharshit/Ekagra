import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubLocalStorage } from '@/test/memoryStorage'
import type { Database } from '@/types/database'
import { wrapOfflineClient } from './dataSource'
import { demoDb } from './demoDb'
import { getDemoMergeSummary, mergeDemoIntoAccount, replayQueuedMutations } from './offlineSync'
import { createMemorySyncStorage, createSyncQueue, syncQueue } from './syncQueue'

stubLocalStorage()

type TableRows = Record<string, Record<string, unknown>[]>

/** Lightweight stateful in-memory fake Supabase client supporting insert, upsert, update, delete, and select/eq/is/maybeSingle. */
function makeFakeSupabase(initial: TableRows = {}, opts: { offline?: boolean; failSelect?: boolean } = {}) {
  const db: TableRows = structuredClone(initial)

  function makeFilterBuilder(table: string, mode: 'select' | 'insert' | 'upsert' | 'update' | 'delete', payload?: unknown) {
    const filters: { col: string; value: unknown }[] = []
    let single = false

    const builder: Record<string, unknown> = {
      select() {
        return builder
      },
      eq(col: string, value: unknown) {
        filters.push({ col, value })
        return builder
      },
      is(col: string, value: unknown) {
        filters.push({ col, value })
        return builder
      },
      single() {
        single = true
        return builder
      },
      maybeSingle() {
        single = true
        return builder
      },
      then(onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        const exec = async () => {
          if (opts.offline) {
            return { data: null, error: { message: 'TypeError: Failed to fetch' } }
          }
          const rows = (db[table] ??= [])
          const matches = (row: Record<string, unknown>) =>
            filters.every((f) => (row[f.col] ?? null) === (f.value ?? null))

          if (mode === 'select') {
            if (opts.failSelect) return { data: null, error: { message: 'select failed' } }
            const found = rows.filter(matches)
            return { data: single ? (found[0] ?? null) : found, error: null, count: found.length }
          }

          if (mode === 'insert') {
            const incoming = Array.isArray(payload) ? payload : [payload]
            for (const item of incoming) {
              const rec = item as Record<string, unknown>
              if (rows.some((r) => r.id === rec.id)) {
                return { data: null, error: { code: '23505', message: 'duplicate key value' } }
              }
              rows.push({ ...rec })
            }
            return { data: single ? incoming[0] : incoming, error: null }
          }

          if (mode === 'upsert') {
            const incoming = Array.isArray(payload) ? payload : [payload]
            for (const item of incoming) {
              const rec = item as Record<string, unknown>
              const idx = rows.findIndex((r) => r.id === rec.id)
              if (idx >= 0) rows[idx] = { ...rows[idx], ...rec }
              else rows.push({ ...rec })
            }
            return { data: single ? incoming[0] : incoming, error: null }
          }

          if (mode === 'update') {
            const patch = payload as Record<string, unknown>
            const updated: Record<string, unknown>[] = []
            for (let i = 0; i < rows.length; i++) {
              const current = rows[i]
              if (current && matches(current)) {
                const next = { ...current, ...patch }
                rows[i] = next
                updated.push(next)
              }
            }
            return { data: single ? (updated[0] ?? null) : updated, error: null }
          }

          const kept = rows.filter((r) => !matches(r))
          db[table] = kept
          return { data: null, error: null }
        }
        return exec().then(onFulfilled, onRejected)
      },
    }

    return builder
  }

  const client = {
    from(table: string) {
      return {
        select() {
          return makeFilterBuilder(table, 'select')
        },
        insert(values: unknown) {
          return makeFilterBuilder(table, 'insert', values)
        },
        upsert(values: unknown) {
          return makeFilterBuilder(table, 'upsert', values)
        },
        update(patch: unknown) {
          return makeFilterBuilder(table, 'update', patch)
        },
        delete() {
          return makeFilterBuilder(table, 'delete')
        },
      }
    },
  } as unknown as SupabaseClient<Database>

  return { client, db }
}

describe('offlineSync & wrapOfflineClient', () => {
  beforeEach(async () => {
    localStorage.clear()
    demoDb.clear()
    await syncQueue.clearScope('user-1')
    await syncQueue.whenIdle()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('queues Supabase mutations when a network fetch error occurs and replays them via LWW', async () => {
    const offline = makeFakeSupabase({}, { offline: true })
    const wrapped = wrapOfflineClient(offline.client, 'user-1')

    const inserted = await wrapped.from('tasks').insert({ title: 'Study offline', area: 'academics' }).select().single()
    expect(inserted.error).toBeNull()
    const insertedId = (inserted.data as { id?: string } | null)?.id
    expect(insertedId).toBeTruthy()

    await wrapped.from('tasks').update({ status: 'done' }).eq('id', insertedId!)

    const queued = await syncQueue.list('user-1')
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({
      table: 'tasks',
      op: 'insert',
      recordId: insertedId,
    })

    // Reconnect and replay onto a clean remote database
    const online = makeFakeSupabase({})
    const report = await replayQueuedMutations(online.client, 'user-1')
    expect(report).toEqual({ applied: 1, conflicts: 0, remaining: 0, error: null })
    expect(online.db.tasks).toHaveLength(1)
    expect(online.db.tasks?.[0]).toMatchObject({
      id: insertedId,
      user_id: 'user-1',
      title: 'Study offline',
      status: 'done',
    })
    expect(await syncQueue.count('user-1')).toBe(0)
  })

  it('keeps newer cloud edits during LWW replay when remote updated_at is strictly newer', async () => {
    const queue = createSyncQueue(createMemorySyncStorage())
    await queue.enqueue({
      scope: 'user-2',
      table: 'tasks',
      op: 'update',
      recordId: 'task-1',
      patch: { title: 'Stale offline title' },
      updatedAt: '2026-11-10T09:00:00.000Z',
    })

    const online = makeFakeSupabase({
      tasks: [
        {
          id: 'task-1',
          user_id: 'user-2',
          title: 'Newer cloud title',
          updated_at: '2026-11-10T10:00:00.000Z',
        },
      ],
    })

    const report = await replayQueuedMutations(online.client, 'user-2', queue)
    expect(report).toEqual({ applied: 0, conflicts: 1, remaining: 0, error: null })
    expect(online.db.tasks?.[0]?.title).toBe('Newer cloud title')
  })

  it('merges local Demo Mode subjects, topics, and natural-key rows into Supabase and clears demo storage', async () => {
    const [subject] = demoDb.insert('subjects', [{ name: 'Operating Systems' }])
    demoDb.insert('topics', [{ subject_id: subject!.id, title: 'Virtual Memory' }])
    demoDb.insert('daily_checkins', [{ date: '2026-11-10', energy: 4, mood: 5 }])
    await syncQueue.whenIdle()

    const summary = await getDemoMergeSummary()
    expect(summary.hasData).toBe(true)
    expect(summary.totalRows).toBe(3)

    // Pre-existing cloud checkin on the same date that is OLDER than demo checkin -> demo wins LWW
    const online = makeFakeSupabase({
      profiles: [{ id: 'cloud-user', onboarded_at: '2026-11-01T00:00:00.000Z' }],
      daily_checkins: [
        {
          id: 'cloud-checkin-1',
          user_id: 'cloud-user',
          date: '2026-11-10',
          energy: 2,
          mood: 2,
          updated_at: '2020-01-01T00:00:00.000Z',
        },
      ],
    })

    const res = await mergeDemoIntoAccount(online.client, 'cloud-user')
    expect(res).toEqual({ mergedRows: 3, conflicts: 0, error: null })
    expect(online.db.subjects).toHaveLength(1)
    expect(online.db.subjects?.[0]).toMatchObject({ user_id: 'cloud-user', name: 'Operating Systems' })
    expect(online.db.topics).toHaveLength(1)
    expect(online.db.daily_checkins).toHaveLength(1)
    expect(online.db.daily_checkins?.[0]).toMatchObject({ id: 'cloud-checkin-1', energy: 4, mood: 5 })

    // Demo tables and queue should be clean after merge
    expect(demoDb.list('subjects')).toEqual([])
    expect(await syncQueue.count('demo')).toBe(0)
  })
})
