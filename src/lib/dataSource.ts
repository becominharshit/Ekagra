import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { useAuthStore } from '@/features/auth/authStore'
import { requireSupabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import { materializeRow, type DemoTable } from './demoDb'
import { isOfflineNetworkError } from './offlineSync'
import { SYNC_TABLE_ORDER, syncQueue, type SyncFilter, type SyncOp } from './syncQueue'

// Where the student's data lives: this device in Demo Mode (src/lib/demoDb.ts), Supabase when
// signed in. Every feature's data functions take a DataSource and work the same way with both,
// so screens never care which one it is (AGENTS.md: every feature works in both modes).

export type DataSource =
  | { kind: 'demo' }
  | { kind: 'supabase'; client: SupabaseClient<Database>; userId: string }

const SYNCABLE_TABLES = new Set<string>(SYNC_TABLE_ORDER)
const offlineClientCache = new WeakMap<object, Map<string, SupabaseClient<Database>>>()

interface MutationMeta {
  table: DemoTable
  op: SyncOp
  values?: unknown
  patch?: Record<string, unknown>
  onConflict?: string
  userId: string
  filters: SyncFilter[]
  wantsData: boolean
  single: boolean
}

function asRecords(values: unknown): Record<string, unknown>[] {
  if (Array.isArray(values)) {
    return values.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
  }
  if (typeof values === 'object' && values !== null) {
    return [values as Record<string, unknown>]
  }
  return []
}

function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

async function queueOfflineMutation(meta: MutationMeta): Promise<{ data: unknown; error: null; count: number | null; status: number; statusText: string }> {
  const now = new Date()
  const updatedAt = now.toISOString()

  if (meta.op === 'insert' || meta.op === 'upsert') {
    const rawRows = asRecords(meta.values)
    const rows: Array<Record<string, unknown>> = rawRows.map((row) => ({
      ...(materializeRow(meta.table, row, meta.userId, now) as unknown as Record<string, unknown>),
      updated_at: updatedAt,
    }))
    for (const row of rows) {
      await syncQueue.enqueue({
        scope: meta.userId,
        table: meta.table,
        op: meta.op,
        recordId: typeof row.id === 'string' ? row.id : undefined,
        rows: [row],
        onConflict: meta.onConflict,
        updatedAt,
      })
    }
    const data = !meta.wantsData ? null : meta.single ? (rows[0] ?? null) : rows
    return { data, error: null, count: rows.length, status: 202, statusText: 'Queued offline' }
  }

  if (meta.op === 'update') {
    const idFilter = meta.filters.find((f) => f.col === 'id' && typeof f.value === 'string')
    const recordId = typeof idFilter?.value === 'string' ? idFilter.value : undefined
    const patch = { ...(meta.patch ?? {}) }
    await syncQueue.enqueue({
      scope: meta.userId,
      table: meta.table,
      op: 'update',
      recordId,
      patch,
      filters: meta.filters,
      updatedAt,
    })
    const optimistic = recordId ? { id: recordId, ...patch, updated_at: updatedAt } : { ...patch, updated_at: updatedAt }
    const data = !meta.wantsData ? null : meta.single ? optimistic : [optimistic]
    return { data, error: null, count: 1, status: 202, statusText: 'Queued offline' }
  }

  const idFilter = meta.filters.find((f) => f.col === 'id' && typeof f.value === 'string')
  const recordId = typeof idFilter?.value === 'string' ? idFilter.value : undefined
  await syncQueue.enqueue({
    scope: meta.userId,
    table: meta.table,
    op: 'delete',
    recordId,
    filters: meta.filters,
    updatedAt,
  })
  return { data: null, error: null, count: 1, status: 202, statusText: 'Queued offline' }
}

function wrapMutationBuilder<T extends object>(builder: T, meta: MutationMeta): T {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === 'eq' || prop === 'is') {
        const fn = Reflect.get(target, prop, target)
        return (col: string, value: unknown) => {
          meta.filters.push({ col, value })
          const next = typeof fn === 'function' ? Reflect.apply(fn, target, [col, value]) : target
          return wrapMutationBuilder(next as object, meta)
        }
      }
      if (prop === 'select') {
        const fn = Reflect.get(target, prop, target)
        return (...args: unknown[]) => {
          meta.wantsData = true
          const next = typeof fn === 'function' ? Reflect.apply(fn, target, args) : target
          return wrapMutationBuilder(next as object, meta)
        }
      }
      if (prop === 'single' || prop === 'maybeSingle') {
        const fn = Reflect.get(target, prop, target)
        return (...args: unknown[]) => {
          meta.single = true
          meta.wantsData = true
          const next = typeof fn === 'function' ? Reflect.apply(fn, target, args) : target
          return wrapMutationBuilder(next as object, meta)
        }
      }
      if (prop === 'then') {
        const realThen = Reflect.get(target, 'then', target) as
          | ((onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => Promise<unknown>)
          | undefined
        return (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
          const execute = async (): Promise<unknown> => {
            if (isBrowserOffline()) {
              return queueOfflineMutation(meta)
            }
            try {
              const res = (await new Promise<unknown>((resolve, reject) => {
                if (typeof realThen === 'function') {
                  realThen.call(target, resolve, reject)
                } else {
                  resolve({ data: null, error: null })
                }
              })) as { error?: unknown }
              if (res && typeof res === 'object' && res.error && isOfflineNetworkError(res.error)) {
                return queueOfflineMutation(meta)
              }
              return res
            } catch (err) {
              if (isOfflineNetworkError(err)) {
                return queueOfflineMutation(meta)
              }
              throw err
            }
          }
          return execute().then(onFulfilled, onRejected)
        }
      }
      const value = Reflect.get(target, prop, receiver)
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          const res = Reflect.apply(value, target, args)
          if (res === target || (typeof res === 'object' && res !== null && 'then' in res)) {
            return wrapMutationBuilder(res as object, meta)
          }
          return res
        }
      }
      return value
    },
  })
}

/**
 * Wraps a SupabaseClient so mutations (`insert`, `upsert`, `update`, `delete`) on syncable tables
 * queue safely into IndexedDB (`syncQueue`) if the user is offline or a network fetch error occurs.
 */
export function wrapOfflineClient(client: SupabaseClient<Database>, userId: string): SupabaseClient<Database> {
  let byUser = offlineClientCache.get(client)
  if (!byUser) {
    byUser = new Map()
    offlineClientCache.set(client, byUser)
  }
  const cached = byUser.get(userId)
  if (cached) return cached

  const wrapped = new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'from') {
        return (table: string) => {
          const queryBuilder = (target as unknown as { from: (t: string) => Record<string, unknown> }).from(table)
          if (!SYNCABLE_TABLES.has(table)) return queryBuilder
          const demoTable = table as DemoTable
          return new Proxy(queryBuilder, {
            get(qbTarget, qbProp, qbReceiver) {
              if (qbProp === 'insert') {
                const fn = Reflect.get(qbTarget, 'insert', qbTarget) as (...a: unknown[]) => object
                return (values: unknown, options?: { onConflict?: string }) =>
                  wrapMutationBuilder(fn.call(qbTarget, values, options), {
                    table: demoTable,
                    op: 'insert',
                    values,
                    onConflict: options?.onConflict,
                    userId,
                    filters: [],
                    wantsData: false,
                    single: false,
                  })
              }
              if (qbProp === 'upsert') {
                const fn = Reflect.get(qbTarget, 'upsert', qbTarget) as (...a: unknown[]) => object
                return (values: unknown, options?: { onConflict?: string }) =>
                  wrapMutationBuilder(fn.call(qbTarget, values, options), {
                    table: demoTable,
                    op: 'upsert',
                    values,
                    onConflict: options?.onConflict,
                    userId,
                    filters: [],
                    wantsData: false,
                    single: false,
                  })
              }
              if (qbProp === 'update') {
                const fn = Reflect.get(qbTarget, 'update', qbTarget) as (...a: unknown[]) => object
                return (patch: Record<string, unknown>, options?: unknown) =>
                  wrapMutationBuilder(fn.call(qbTarget, patch, options), {
                    table: demoTable,
                    op: 'update',
                    patch,
                    userId,
                    filters: [],
                    wantsData: false,
                    single: false,
                  })
              }
              if (qbProp === 'delete') {
                const fn = Reflect.get(qbTarget, 'delete', qbTarget) as (...a: unknown[]) => object
                return (options?: unknown) =>
                  wrapMutationBuilder(fn.call(qbTarget, options), {
                    table: demoTable,
                    op: 'delete',
                    userId,
                    filters: [],
                    wantsData: false,
                    single: false,
                  })
              }
              const value = Reflect.get(qbTarget, qbProp, qbReceiver)
              return typeof value === 'function' ? value.bind(qbTarget) : value
            },
          })
        }
      }
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })

  byUser.set(userId, wrapped)
  return wrapped
}

/** The data source of whoever uses the app right now, and an `owner` key for query keys. */
export function useDataSource(): { source: DataSource | null; owner: string | null } {
  const status = useAuthStore((state) => state.status)
  const userId = useAuthStore((state) => state.user?.id ?? null)
  if (status === 'demo') return { source: { kind: 'demo' }, owner: 'demo' }
  if (status === 'signed_in' && userId) {
    return { source: { kind: 'supabase', client: wrapOfflineClient(requireSupabase(), userId), userId }, owner: userId }
  }
  return { source: null, owner: null }
}

/** For query functions: the source, or a clear error if the person was signed out meanwhile. */
export function need(source: DataSource | null): DataSource {
  if (!source) throw new Error('Please sign in again.')
  return source
}

const PAGE_SIZE = 1000
const MAX_PAGES = 50

/** All rows of a Supabase query, one page (1000 rows) at a time: `page(from, to)` runs it with `.range(from, to)`. */
export async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>): Promise<T[]> {
  const rows: T[] = []
  for (let index = 0; index < MAX_PAGES; index++) {
    const from = index * PAGE_SIZE
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw dbError(error)
    rows.push(...(data ?? []))
    if ((data ?? []).length < PAGE_SIZE) break
  }
  return rows
}

/** Checks added by later migrations: failing one means the server's database is older than the app. */
const NEWER_CHECKS = ['hustles_type_check', 'hustles_links_is_list']

/** Tables added by later migrations (003_beta.sql onwards). */
const NEWER_TABLES =
  /\b(feedback|attendance|marks|semester_results|subject_ratings|metric_snapshots|challenges|weekly_reviews|habits|habit_logs|workouts|meals|sleep_logs|step_counts|speaking_sessions|shared_stats|shared_stats_view|partner_invites|partner_links|study_groups|group_members|group_sessions|nudges|notes|plan_entitlements|subscriptions|webhook_events|analytics_events)\b/

const NEEDS_UPDATE = 'The database needs the latest update. Run `npm run db:push` (docs/4-setup-guide.md, step 2), then try again.'

/** A database error in plain words. */
export function dbError(error: PostgrestError): Error {
  if (error.code === 'PGRST205' || error.code === '42P01') {
    if (NEWER_TABLES.test(error.message)) return new Error(NEEDS_UPDATE)
    return new Error(
      "The database tables don't exist yet. Run `npm run db:push` (docs/4-setup-guide.md, step 2), then try again.",
    )
  }
  // A column, rule or function (PGRST202) from a newer migration in supabase/migrations/ isn't on the server yet.
  if (
    error.code === 'PGRST204' ||
    error.code === 'PGRST202' ||
    error.code === '42703' ||
    (error.code === '23514' && NEWER_CHECKS.some((name) => error.message.includes(name)))
  ) {
    return new Error(NEEDS_UPDATE)
  }
  return new Error(error.message)
}
