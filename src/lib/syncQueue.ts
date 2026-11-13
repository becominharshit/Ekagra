import type { DemoTable } from './demoDb'

export type SyncOp = 'insert' | 'upsert' | 'update' | 'delete'

export interface SyncFilter {
  col: string
  value: unknown
}

export interface QueuedMutation {
  id: string
  scope: string
  table: DemoTable
  op: SyncOp
  recordId?: string
  rows?: Record<string, unknown>[]
  patch?: Record<string, unknown>
  onConflict?: string
  filters?: SyncFilter[]
  updatedAt: string
  createdAt: string
  seq?: number
}

export type EnqueueInput = Omit<QueuedMutation, 'id' | 'createdAt' | 'seq'> & {
  id?: string
  createdAt?: string
}

export interface SyncStorageAdapter {
  getAll(): Promise<QueuedMutation[]>
  put(item: QueuedMutation): Promise<void>
  replaceAll(items: QueuedMutation[]): Promise<void>
  remove(ids: string[]): Promise<void>
  clearScope(scope: string): Promise<void>
}

/**
 * Topological table order (parents before children) matching Supabase foreign keys.
 * Every table in DEMO_TABLES is included so replay/merge never hits FK ordering errors.
 */
export const SYNC_TABLE_ORDER: readonly DemoTable[] = [
  'hustles',
  'subjects',
  'habits',
  'blocked_apps',
  'topics',
  'topic_prereqs',
  'materials',
  'material_pages',
  'ai_anchors',
  'lessons',
  'past_papers',
  'questions',
  'quizzes',
  'attempts',
  'flashcards',
  'flashcard_reviews',
  'code_snippets',
  'mistakes',
  'hustle_phases',
  'hustle_steps',
  'clients',
  'hustle_items',
  'tasks',
  'plan_blocks',
  'daily_checkins',
  'focus_sessions',
  'distraction_events',
  'transactions',
  'time_entries',
  'feedback',
  'attendance',
  'marks',
  'semester_results',
  'subject_ratings',
  'metric_snapshots',
  'challenges',
  'weekly_reviews',
  'habit_logs',
  'workouts',
  'meals',
  'sleep_logs',
  'step_counts',
  'speaking_sessions',
  'shared_stats',
  'notes',
] as const

const TABLE_ORDER_INDEX = new Map<string, number>(SYNC_TABLE_ORDER.map((t, i) => [t, i]))

export function tableSyncRank(table: string): number {
  return TABLE_ORDER_INDEX.get(table) ?? SYNC_TABLE_ORDER.length
}

/**
 * Natural unique keys (besides `id`) defined in Postgres constraints.
 * Used for Last-Write-Wins duplicate resolution during cloud merge.
 */
export const NATURAL_CONFLICT_KEYS: Partial<Record<DemoTable, readonly string[]>> = {
  daily_checkins: ['user_id', 'date'],
  topic_prereqs: ['topic_id', 'prereq_topic_id'],
  material_pages: ['material_id', 'page_no'],
  lessons: ['topic_id'],
  blocked_apps: ['user_id', 'package_name'],
  attendance: ['user_id', 'subject_id', 'date', 'start_time'],
  semester_results: ['user_id', 'semester'],
  subject_ratings: ['user_id', 'subject_id'],
  metric_snapshots: ['user_id', 'week_start'],
  challenges: ['user_id', 'week_start'],
  weekly_reviews: ['user_id', 'week_start'],
  habit_logs: ['user_id', 'habit_id', 'date'],
  sleep_logs: ['user_id', 'date', 'source'],
  step_counts: ['user_id', 'date', 'source'],
  shared_stats: ['user_id'],
}

/** Last-Write-Wins timestamp comparison in UTC milliseconds. */
export function resolveLwwAction(
  localUpdatedAt: string | null | undefined,
  remoteUpdatedAt: string | null | undefined,
): 'apply_local' | 'keep_remote' {
  if (!remoteUpdatedAt) return 'apply_local'
  if (!localUpdatedAt) return 'keep_remote'
  const localMs = Date.parse(localUpdatedAt)
  const remoteMs = Date.parse(remoteUpdatedAt)
  if (Number.isNaN(remoteMs)) return 'apply_local'
  if (Number.isNaN(localMs)) return 'keep_remote'
  return remoteMs > localMs ? 'keep_remote' : 'apply_local'
}

/** Coalesces redundant mutations on the same record inside a scope while preserving LWW order. */
export function compactMutations(items: QueuedMutation[]): QueuedMutation[] {
  const result: QueuedMutation[] = []

  for (const next of items) {
    if (!next.recordId) {
      result.push(next)
      continue
    }

    const matchIndex = result.findIndex(
      (existing) => existing.scope === next.scope && existing.table === next.table && existing.recordId === next.recordId,
    )

    if (matchIndex === -1) {
      result.push({
        ...next,
        rows: next.rows ? next.rows.map((r) => ({ ...r })) : undefined,
        patch: next.patch ? { ...next.patch } : undefined,
      })
      continue
    }

    const prev = result[matchIndex]
    if (!prev) {
      result.push(next)
      continue
    }

    // If a record was inserted and then deleted before syncing, drop both mutations.
    if (prev.op === 'insert' && next.op === 'delete') {
      result.splice(matchIndex, 1)
      continue
    }

    // If a record was inserted and then updated locally, fold the patch into the inserted row.
    if ((prev.op === 'insert' || prev.op === 'upsert') && next.op === 'update' && prev.rows && next.patch) {
      const mergedRows = prev.rows.map((row) =>
        row.id === next.recordId ? { ...row, ...next.patch, updated_at: next.updatedAt } : row,
      )
      result[matchIndex] = { ...prev, rows: mergedRows, updatedAt: next.updatedAt }
      continue
    }

    // Two updates on the same record collapse via Last-Write-Wins on patch fields.
    if (prev.op === 'update' && next.op === 'update') {
      const winnerIsNext = resolveLwwAction(next.updatedAt, prev.updatedAt) === 'apply_local'
      const mergedPatch = winnerIsNext
        ? { ...(prev.patch ?? {}), ...(next.patch ?? {}) }
        : { ...(next.patch ?? {}), ...(prev.patch ?? {}) }
      result[matchIndex] = {
        ...prev,
        patch: mergedPatch,
        updatedAt: winnerIsNext ? next.updatedAt : prev.updatedAt,
      }
      continue
    }

    // Update followed by delete: only keep the delete.
    if (prev.op === 'update' && next.op === 'delete') {
      result[matchIndex] = { ...next, seq: prev.seq }
      continue
    }

    result.push(next)
  }

  return result
}

export function sortForReplay(items: QueuedMutation[]): QueuedMutation[] {
  return [...items].sort((a, b) => {
    // Deletes run in reverse dependency order (children first); inserts/updates run parents first.
    if (a.op === 'delete' && b.op !== 'delete') return 1
    if (a.op !== 'delete' && b.op === 'delete') return -1
    const rankDiff = tableSyncRank(a.table) - tableSyncRank(b.table)
    const tableOrder = a.op === 'delete' ? -rankDiff : rankDiff
    if (tableOrder !== 0) return tableOrder
    return (a.seq ?? 0) - (b.seq ?? 0) || a.createdAt.localeCompare(b.createdAt)
  })
}

export function createMemorySyncStorage(): SyncStorageAdapter {
  let store: QueuedMutation[] = []
  let seqCounter = 1
  return {
    async getAll() {
      return store.map((item) => ({ ...item }))
    },
    async put(item) {
      store.push({ ...item, seq: item.seq ?? seqCounter++ })
    },
    async replaceAll(items) {
      store = items.map((item) => ({ ...item, seq: item.seq ?? seqCounter++ }))
    },
    async remove(ids) {
      const drop = new Set(ids)
      store = store.filter((item) => !drop.has(item.id))
    },
    async clearScope(scope) {
      store = store.filter((item) => item.scope !== scope)
    },
  }
}

export function createIndexedDbSyncStorage(dbName = 'ekagra-offline-sync', storeName = 'mutations'): SyncStorageAdapter {
  const fallback = createMemorySyncStorage()
  let dbPromise: Promise<IDBDatabase | null> | null = null

  function openDb(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null)
    if (dbPromise) return dbPromise
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(dbName, 1)
        req.onupgradeneeded = () => {
          const db = req.result
          if (!db.objectStoreNames.contains(storeName)) {
            const objectStore = db.createObjectStore(storeName, { keyPath: 'id' })
            objectStore.createIndex('scope', 'scope', { unique: false })
          }
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(null)
        req.onblocked = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
    return dbPromise
  }

  async function withStore<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => Promise<T>,
    onFallback: () => Promise<T>,
  ): Promise<T> {
    const db = await openDb()
    if (!db) return onFallback()
    try {
      const tx = db.transaction(storeName, mode)
      const objectStore = tx.objectStore(storeName)
      return await run(objectStore)
    } catch {
      return onFallback()
    }
  }

  function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  return {
    getAll() {
      return withStore(
        'readonly',
        async (objectStore) => {
          const rows = await requestToPromise(objectStore.getAll() as IDBRequest<QueuedMutation[]>)
          return rows.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || a.createdAt.localeCompare(b.createdAt))
        },
        () => fallback.getAll(),
      )
    },
    put(item) {
      return withStore(
        'readwrite',
        async (objectStore) => {
          await requestToPromise(objectStore.put(item))
        },
        () => fallback.put(item),
      )
    },
    replaceAll(items) {
      return withStore(
        'readwrite',
        async (objectStore) => {
          await requestToPromise(objectStore.clear())
          for (const item of items) {
            await requestToPromise(objectStore.put(item))
          }
        },
        () => fallback.replaceAll(items),
      )
    },
    remove(ids) {
      if (ids.length === 0) return Promise.resolve()
      return withStore(
        'readwrite',
        async (objectStore) => {
          for (const id of ids) {
            await requestToPromise(objectStore.delete(id))
          }
        },
        () => fallback.remove(ids),
      )
    },
    clearScope(scope) {
      return withStore(
        'readwrite',
        async (objectStore) => {
          const rows = await requestToPromise(objectStore.getAll() as IDBRequest<QueuedMutation[]>)
          for (const row of rows) {
            if (row.scope === scope) {
              await requestToPromise(objectStore.delete(row.id))
            }
          }
        },
        () => fallback.clearScope(scope),
      )
    },
  }
}

export type SyncListener = () => void

export interface SyncQueue {
  enqueue(input: EnqueueInput): Promise<void>
  list(scope?: string): Promise<QueuedMutation[]>
  count(scope?: string): Promise<number>
  remove(ids: string[]): Promise<void>
  clearScope(scope: string): Promise<void>
  subscribe(listener: SyncListener): () => void
  whenIdle(): Promise<void>
}

export function createSyncQueue(storage: SyncStorageAdapter = createIndexedDbSyncStorage()): SyncQueue {
  const listeners = new Set<SyncListener>()
  let chain: Promise<unknown> = Promise.resolve()
  let nextSeq = Date.now()

  function notify() {
    for (const listener of listeners) listener()
  }

  function serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(task, task)
    chain = run.catch(() => undefined)
    return run
  }

  return {
    enqueue(input) {
      return serialize(async () => {
        const entry: QueuedMutation = {
          ...input,
          id: input.id ?? crypto.randomUUID(),
          createdAt: input.createdAt ?? new Date().toISOString(),
          seq: nextSeq++,
        }
        const existing = await storage.getAll()
        const compacted = compactMutations([...existing, entry])
        await storage.replaceAll(compacted)
        notify()
      })
    },
    list(scope) {
      return serialize(async () => {
        const all = await storage.getAll()
        return scope === undefined ? all : all.filter((item) => item.scope === scope)
      })
    },
    count(scope) {
      return serialize(async () => {
        const all = await storage.getAll()
        return scope === undefined ? all.length : all.filter((item) => item.scope === scope).length
      })
    },
    remove(ids) {
      return serialize(async () => {
        await storage.remove(ids)
        notify()
      })
    },
    clearScope(scope) {
      return serialize(async () => {
        await storage.clearScope(scope)
        notify()
      })
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    whenIdle() {
      return chain.then(() => undefined)
    },
  }
}

export const syncQueue = createSyncQueue()
