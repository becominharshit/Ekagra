import { describe, expect, it } from 'vitest'
import {
  compactMutations,
  createMemorySyncStorage,
  createSyncQueue,
  resolveLwwAction,
  sortForReplay,
  SYNC_TABLE_ORDER,
} from './syncQueue'
import { DEMO_TABLES } from './demoDb'

describe('syncQueue & LWW compaction', () => {
  it('covers every DemoTable in topological SYNC_TABLE_ORDER', () => {
    expect(new Set(SYNC_TABLE_ORDER)).toEqual(new Set(DEMO_TABLES))
    expect(SYNC_TABLE_ORDER.indexOf('hustles')).toBeLessThan(SYNC_TABLE_ORDER.indexOf('tasks'))
    expect(SYNC_TABLE_ORDER.indexOf('subjects')).toBeLessThan(SYNC_TABLE_ORDER.indexOf('topics'))
    expect(SYNC_TABLE_ORDER.indexOf('habits')).toBeLessThan(SYNC_TABLE_ORDER.indexOf('habit_logs'))
  })

  it('compares UTC timestamps accurately for Last-Write-Wins', () => {
    expect(resolveLwwAction('2026-11-10T12:00:00.000Z', '2026-11-10T11:59:59.000Z')).toBe('apply_local')
    expect(resolveLwwAction('2026-11-10T12:00:00.000Z', '2026-11-10T12:00:00.000Z')).toBe('apply_local')
    expect(resolveLwwAction('2026-11-10T12:00:00.000Z', '2026-11-10T12:00:01.000Z')).toBe('keep_remote')
    expect(resolveLwwAction('2026-11-10T12:00:00.000Z', null)).toBe('apply_local')
  })

  it('compacts insert + update, multiple updates, and insert + delete per scope', () => {
    const items = compactMutations([
      {
        id: 'm1',
        scope: 'user-1',
        table: 'tasks',
        op: 'insert',
        recordId: 't1',
        rows: [{ id: 't1', title: 'Draft', priority: 2 }],
        updatedAt: '2026-11-10T10:00:00.000Z',
        createdAt: '2026-11-10T10:00:00.000Z',
        seq: 1,
      },
      {
        id: 'm2',
        scope: 'user-1',
        table: 'tasks',
        op: 'update',
        recordId: 't1',
        patch: { title: 'Final title', priority: 1 },
        updatedAt: '2026-11-10T10:05:00.000Z',
        createdAt: '2026-11-10T10:05:00.000Z',
        seq: 2,
      },
      {
        id: 'm3',
        scope: 'user-1',
        table: 'subjects',
        op: 'insert',
        recordId: 's-temp',
        rows: [{ id: 's-temp', name: 'Temp' }],
        updatedAt: '2026-11-10T10:01:00.000Z',
        createdAt: '2026-11-10T10:01:00.000Z',
        seq: 3,
      },
      {
        id: 'm4',
        scope: 'user-1',
        table: 'subjects',
        op: 'delete',
        recordId: 's-temp',
        updatedAt: '2026-11-10T10:02:00.000Z',
        createdAt: '2026-11-10T10:02:00.000Z',
        seq: 4,
      },
      {
        id: 'm5',
        scope: 'user-1',
        table: 'tasks',
        op: 'update',
        recordId: 't-remote',
        patch: { status: 'done', notes: 'Latest' },
        updatedAt: '2026-11-10T10:10:00.000Z',
        createdAt: '2026-11-10T10:10:00.000Z',
        seq: 5,
      },
      {
        id: 'm6',
        scope: 'user-1',
        table: 'tasks',
        op: 'update',
        recordId: 't-remote',
        patch: { notes: 'Older edit' },
        updatedAt: '2026-11-10T10:08:00.000Z',
        createdAt: '2026-11-10T10:11:00.000Z',
        seq: 6,
      },
    ])

    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      table: 'tasks',
      op: 'insert',
      rows: [{ id: 't1', title: 'Final title', priority: 1, updated_at: '2026-11-10T10:05:00.000Z' }],
    })
    expect(items[1]).toMatchObject({
      table: 'tasks',
      op: 'update',
      recordId: 't-remote',
      patch: { status: 'done', notes: 'Latest' },
      updatedAt: '2026-11-10T10:10:00.000Z',
    })
  })

  it('orders parent tables before child tables for replay and reverses for deletes', () => {
    const sorted = sortForReplay([
      {
        id: '1',
        scope: 'u',
        table: 'tasks',
        op: 'insert',
        updatedAt: '2026-11-10T10:00:00Z',
        createdAt: '2026-11-10T10:00:00Z',
        seq: 1,
      },
      {
        id: '2',
        scope: 'u',
        table: 'hustles',
        op: 'insert',
        updatedAt: '2026-11-10T10:00:00Z',
        createdAt: '2026-11-10T10:00:00Z',
        seq: 2,
      },
      {
        id: '3',
        scope: 'u',
        table: 'hustles',
        op: 'delete',
        recordId: 'h1',
        updatedAt: '2026-11-10T10:01:00Z',
        createdAt: '2026-11-10T10:01:00Z',
        seq: 3,
      },
      {
        id: '4',
        scope: 'u',
        table: 'tasks',
        op: 'delete',
        recordId: 't1',
        updatedAt: '2026-11-10T10:01:00Z',
        createdAt: '2026-11-10T10:01:00Z',
        seq: 4,
      },
    ])

    expect(sorted.map((s) => `${s.op}:${s.table}`)).toEqual([
      'insert:hustles',
      'insert:tasks',
      'delete:tasks',
      'delete:hustles',
    ])
  })

  it('persists, compacts, notifies subscribers, and clears per scope', async () => {
    const queue = createSyncQueue(createMemorySyncStorage())
    let ticks = 0
    const unsub = queue.subscribe(() => {
      ticks += 1
    })

    await queue.enqueue({
      scope: 'demo',
      table: 'subjects',
      op: 'insert',
      recordId: 's1',
      rows: [{ id: 's1', name: 'Math' }],
      updatedAt: '2026-11-10T10:00:00.000Z',
    })
    await queue.enqueue({
      scope: 'user-99',
      table: 'tasks',
      op: 'insert',
      recordId: 't99',
      rows: [{ id: 't99', title: 'Offline Task' }],
      updatedAt: '2026-11-10T10:01:00.000Z',
    })

    expect(await queue.count('demo')).toBe(1)
    expect(await queue.count('user-99')).toBe(1)
    expect(await queue.count()).toBe(2)
    expect(ticks).toBe(2)

    await queue.clearScope('demo')
    expect(await queue.count('demo')).toBe(0)
    expect(await queue.list('user-99')).toHaveLength(1)
    unsub()
  })
})
