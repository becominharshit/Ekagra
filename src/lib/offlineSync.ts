import type { SupabaseClient } from '@supabase/supabase-js'
import { clearDemoData, demoProfileRepo } from '@/features/profile/localStore'
import type { Database } from '@/types/database'
import { demoDb, type DemoTable } from './demoDb'
import {
  NATURAL_CONFLICT_KEYS,
  resolveLwwAction,
  sortForReplay,
  SYNC_TABLE_ORDER,
  syncQueue,
  type QueuedMutation,
  type SyncQueue,
} from './syncQueue'

export interface DemoMergeSummary {
  hasData: boolean
  totalRows: number
  tablesWithData: { table: DemoTable; count: number }[]
  hasOnboardedProfile: boolean
  routineCount: number
}

export interface SyncReplayReport {
  applied: number
  conflicts: number
  remaining: number
  error: string | null
}

/** Checks whether local Demo Mode storage has data waiting to be merged into an authenticated account. */
export async function getDemoMergeSummary(): Promise<DemoMergeSummary> {
  const tablesWithData: { table: DemoTable; count: number }[] = []
  let totalRows = 0

  for (const table of SYNC_TABLE_ORDER) {
    const count = demoDb.list(table).length
    if (count > 0) {
      tablesWithData.push({ table, count })
      totalRows += count
    }
  }

  let hasOnboardedProfile = false
  let routineCount = 0
  try {
    const profile = await demoProfileRepo.getProfile()
    hasOnboardedProfile = Boolean(profile?.onboarded_at)
    routineCount = (await demoProfileRepo.getRoutine()).length
  } catch {
    // Ignore storage read errors in restricted environments
  }

  const queuedDemo = await syncQueue.count('demo')
  const hasData = totalRows > 0 || hasOnboardedProfile || routineCount > 0 || queuedDemo > 0

  return {
    hasData,
    totalRows,
    tablesWithData,
    hasOnboardedProfile,
    routineCount,
  }
}

export function isOfflineNetworkError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error && typeof (error as { message: unknown }).message === 'string'
        ? (error as { message: string }).message
        : ''
  return /failed to fetch|networkerror|network request failed|fetch failed|load failed|err_internet_disconnected|offline/i.test(
    message,
  )
}

interface RemoteMatch {
  id: string
  updated_at?: string | null
}

/** Finds an existing cloud row matching `id` or natural unique constraint keys for LWW conflict checks. */
async function findRemoteMatch(
  client: SupabaseClient<Database>,
  table: DemoTable,
  row: Record<string, unknown>,
  userId: string,
): Promise<RemoteMatch | null> {
  const untyped = client as unknown as SupabaseClient
  const naturalKeys = NATURAL_CONFLICT_KEYS[table]
  if (naturalKeys && naturalKeys.length > 0) {
    let query = untyped.from(table).select('id, updated_at')
    let allPresent = true
    for (const key of naturalKeys) {
      const value = key === 'user_id' ? userId : row[key]
      if (value === undefined) {
        allPresent = false
        break
      }
      query = value === null ? query.is(key, null) : query.eq(key, value)
    }
    if (allPresent) {
      const { data, error } = await query.maybeSingle()
      if (!error && data && typeof data === 'object' && 'id' in data) {
        return data as RemoteMatch
      }
    }
  }

  if (typeof row.id === 'string') {
    const { data, error } = await untyped.from(table).select('id, updated_at').eq('id', row.id).maybeSingle()
    if (!error && data && typeof data === 'object' && 'id' in data) {
      return data as RemoteMatch
    }
  }
  return null
}

/** Applies a batch of rows for one table using Last-Write-Wins (LWW) conflict resolution. */
async function upsertRowWithLww(
  client: SupabaseClient<Database>,
  table: DemoTable,
  rawRow: Record<string, unknown>,
  userId: string,
  localTimestamp: string,
): Promise<'applied' | 'conflict'> {
  const untyped = client as unknown as SupabaseClient
  const normalized: Record<string, unknown> = { ...rawRow }
  if ('user_id' in normalized || table !== 'topic_prereqs') {
    normalized.user_id = userId
  }

  const remote = await findRemoteMatch(client, table, normalized, userId)
  if (remote) {
    const action = resolveLwwAction(
      typeof normalized.updated_at === 'string' ? normalized.updated_at : localTimestamp,
      remote.updated_at,
    )
    if (action === 'keep_remote') {
      return 'conflict'
    }
    const patch = { ...normalized }
    delete patch.id
    delete patch.user_id
    delete patch.created_at
    const { error } = await untyped.from(table).update(patch).eq('id', remote.id)
    if (error) throw new Error(error.message)
    return 'applied'
  }

  const { error } = await untyped.from(table).insert(normalized)
  if (error) {
    // Handle race / duplicate primary key via upsert
    if (error.code === '23505') {
      const { error: upsertErr } = await untyped.from(table).upsert(normalized, { onConflict: 'id' })
      if (upsertErr) throw new Error(upsertErr.message)
      return 'applied'
    }
    throw new Error(error.message)
  }
  return 'applied'
}

/** Replays queued offline mutations for an authenticated user using Last-Write-Wins. */
export async function replayQueuedMutations(
  client: SupabaseClient<Database>,
  userId: string,
  queue: SyncQueue = syncQueue,
): Promise<SyncReplayReport> {
  const items = sortForReplay(await queue.list(userId))
  if (items.length === 0) {
    return { applied: 0, conflicts: 0, remaining: 0, error: null }
  }

  let applied = 0
  let conflicts = 0
  const completedIds: string[] = []
  const untyped = client as unknown as SupabaseClient

  try {
    for (const mutation of items) {
      await applySingleMutation(client, untyped, userId, mutation, () => {
        applied += 1
      }, () => {
        conflicts += 1
      })
      completedIds.push(mutation.id)
    }
    await queue.remove(completedIds)
    return { applied, conflicts, remaining: 0, error: null }
  } catch (err) {
    if (completedIds.length > 0) {
      await queue.remove(completedIds)
    }
    const remaining = await queue.count(userId)
    return {
      applied,
      conflicts,
      remaining,
      error: err instanceof Error ? err.message : 'Offline sync interrupted; will retry automatically.',
    }
  }
}

async function applySingleMutation(
  client: SupabaseClient<Database>,
  untyped: SupabaseClient,
  userId: string,
  mutation: QueuedMutation,
  onApplied: () => void,
  onConflict: () => void,
): Promise<void> {
  if (mutation.op === 'insert' || mutation.op === 'upsert') {
    for (const row of mutation.rows ?? []) {
      const outcome = await upsertRowWithLww(client, mutation.table, row, userId, mutation.updatedAt)
      if (outcome === 'conflict') onConflict()
      else onApplied()
    }
    return
  }

  if (mutation.op === 'update') {
    if (mutation.recordId) {
      const { data: existing } = await untyped
        .from(mutation.table)
        .select('id, updated_at')
        .eq('id', mutation.recordId)
        .maybeSingle()
      if (existing && typeof existing === 'object' && 'updated_at' in existing) {
        const remoteUpdatedAt = (existing as { updated_at?: string | null }).updated_at
        if (resolveLwwAction(mutation.updatedAt, remoteUpdatedAt) === 'keep_remote') {
          onConflict()
          return
        }
      }
    }
    let query = untyped.from(mutation.table).update({ ...(mutation.patch ?? {}) })
    if (mutation.recordId) query = query.eq('id', mutation.recordId)
    for (const filter of mutation.filters ?? []) {
      if (filter.col === 'id' && mutation.recordId) continue
      query = filter.value === null ? query.is(filter.col, null) : query.eq(filter.col, filter.value)
    }
    const { error } = await query
    if (error) throw new Error(error.message)
    onApplied()
    return
  }

  if (mutation.op === 'delete') {
    let query = untyped.from(mutation.table).delete()
    if (mutation.recordId) query = query.eq('id', mutation.recordId)
    for (const filter of mutation.filters ?? []) {
      if (filter.col === 'id' && mutation.recordId) continue
      query = filter.value === null ? query.is(filter.col, null) : query.eq(filter.col, filter.value)
    }
    const { error } = await query
    if (error) throw new Error(error.message)
    onApplied()
  }
}

/** Merges local Demo Mode data (tables + profile/routine) into the authenticated Supabase account. */
export async function mergeDemoIntoAccount(
  client: SupabaseClient<Database>,
  userId: string,
  queue: SyncQueue = syncQueue,
): Promise<{ mergedRows: number; conflicts: number; error: string | null }> {
  let mergedRows = 0
  let conflicts = 0

  try {
    // 1. Merge demo tables in parent-before-child topological order using LWW
    for (const table of SYNC_TABLE_ORDER) {
      const rows = demoDb.list(table)
      for (const row of rows) {
        const record = row as unknown as Record<string, unknown>
        const ts = typeof record.updated_at === 'string' ? record.updated_at : new Date().toISOString()
        const outcome = await upsertRowWithLww(client, table, record, userId, ts)
        if (outcome === 'conflict') conflicts += 1
        else mergedRows += 1
      }
    }

    // 2. Migrate Demo profile & routine if the cloud account hasn't completed onboarding yet
    const demoProfile = await demoProfileRepo.getProfile()
    const demoRoutine = await demoProfileRepo.getRoutine()
    if (demoProfile?.onboarded_at) {
      const { data: cloudProfile, error: profErr } = await client
        .from('profiles')
        .select('id, onboarded_at, updated_at')
        .eq('id', userId)
        .maybeSingle()
      if (profErr) throw new Error(profErr.message)

      if (cloudProfile && !cloudProfile.onboarded_at) {
        const { error: updateErr } = await client
          .from('profiles')
          .update({
            full_name: demoProfile.full_name,
            college: demoProfile.college,
            program: demoProfile.program,
            year: demoProfile.year,
            semester: demoProfile.semester,
            timezone: demoProfile.timezone,
            currency: demoProfile.currency,
            chronotype: demoProfile.chronotype,
            mentor_tone: demoProfile.mentor_tone,
            settings: demoProfile.settings,
            onboarded_at: demoProfile.onboarded_at,
          })
          .eq('id', userId)
        if (updateErr) throw new Error(updateErr.message)
        mergedRows += 1

        if (demoRoutine.length > 0) {
          const { count } = await client
            .from('routine_blocks')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
          if ((count ?? 0) === 0) {
            const routineInserts = demoRoutine.map((block) => ({
              user_id: userId,
              title: block.title,
              kind: block.kind,
              days_of_week: block.days_of_week,
              start_time: block.start_time,
              end_time: block.end_time,
              subject_id: block.subject_id,
              valid_from: block.valid_from,
              valid_to: block.valid_to,
            }))
            const { error: routineErr } = await client.from('routine_blocks').insert(routineInserts)
            if (routineErr) throw new Error(routineErr.message)
            mergedRows += routineInserts.length
          }
        }
      }
    }

    clearDemoData()
    await queue.clearScope('demo')
    return { mergedRows, conflicts, error: null }
  } catch (err) {
    return {
      mergedRows,
      conflicts,
      error: err instanceof Error ? err.message : 'Could not merge local Demo Mode data.',
    }
  }
}

export async function discardDemoMergeData(queue: SyncQueue = syncQueue): Promise<void> {
  clearDemoData()
  await queue.clearScope('demo')
}
