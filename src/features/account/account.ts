import type { SupabaseClient } from '@supabase/supabase-js'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  AccountDeleteResponseSchema,
  AccountExportResponseSchema,
  type AccountDeleteRequest,
} from '@shared/schemas.ts'
import { USER_TABLES } from '@shared/userTables.ts'
import { callAiFunction } from '@/features/ai/aiClient'
import { signOut } from '@/features/auth/auth'
import type { AppUser } from '@/features/auth/authStore'
import { useFocusStore } from '@/features/focus/focusStore'
import { useLaunchpadStore } from '@/features/hustle/launchpadStore'
import { useModeStore } from '@/features/mode/modeStore'
import { demoProfileRepo } from '@/features/profile/localStore'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { DEMO_TABLES, demoDb } from '@/lib/demoDb'
import { focusGuard } from '@/lib/native/focusGuard'
import { setAccountNotice } from './notice'

// Me → Account and privacy: a copy of all your data as one JSON file, wiping the data, and deleting
// the account. Wiping and deleting run on the server (the account-delete Edge Function), which
// removes your files too; afterwards this device forgets what it kept for you.

/** The tables in the file: the profile, then parents before children (the reverse of the delete order). */
const EXPORT_ORDER: string[] = ['profiles', ...[...USER_TABLES].reverse()]

const FILES_NOTE =
  "PDFs and feedback screenshots aren't inside this file. Where they're stored is in materials.storage_path and feedback.screenshot_path; open a PDF from the Library to save it."

export interface DataExport {
  app: 'Ekagra'
  format: 1
  exportedAt: string
  mode: 'signed_in' | 'demo'
  user: { id: string; email: string | null; name: string } | null
  note: string
  /** Rows per table. */
  counts: Record<string, number>
  tables: Record<string, unknown[]>
}

export interface ExportFile {
  name: string
  json: string
  rows: number
}

const PAGE_SIZE = 1000
const MAX_PAGES = 100
/** Tables read at the same time. */
const PARALLEL = 4

/** All of one table's rows of this student, a page at a time. */
async function readTable(client: SupabaseClient, table: string, userId: string): Promise<unknown[]> {
  const rows: unknown[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE
    const { data, error } = await client
      .from(table)
      .select('*')
      .eq(table === 'profiles' ? 'id' : 'user_id', userId)
      .order('created_at')
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      // A table from a newer migration that the server doesn't have yet: none of your rows are in it.
      if (error.code === 'PGRST205') return rows
      throw dbError(error)
    }
    rows.push(...(data as unknown[]))
    if (data.length < PAGE_SIZE) return rows
  }
  throw new Error(`Your ${table} has more rows than one export can hold. Please tell the founder (Send feedback).`)
}

async function readEverything(source: DataSource, onProgress?: (done: number, total: number) => void): Promise<Record<string, unknown[]>> {
  if (source.kind === 'demo') {
    const tables: Record<string, unknown[]> = {
      profiles: [await demoProfileRepo.getProfile()],
      routine_blocks: await demoProfileRepo.getRoutine(),
    }
    for (const table of DEMO_TABLES) tables[table] = demoDb.list(table)
    return tables
  }
  // Every table, so the client without the table types.
  const client = source.client as unknown as SupabaseClient
  const tables: Record<string, unknown[]> = {}
  const waiting = [...EXPORT_ORDER]
  let done = 0
  const worker = async () => {
    for (let table = waiting.shift(); table; table = waiting.shift()) {
      tables[table] = await readTable(client, table, source.userId)
      done += 1
      onProgress?.(done, EXPORT_ORDER.length)
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker))
  return tables
}

function toExportFile(data: DataExport, now: Date): ExportFile {
  return {
    name: `ekagra-export-${format(now, 'yyyy-MM-dd')}.json`,
    json: JSON.stringify(data, null, 2),
    rows: Object.values(data.counts).reduce((sum, count) => sum + count, 0),
  }
}

/** Everything the student added, as one readable JSON file (nothing is sent anywhere). */
export async function buildExport(
  source: DataSource,
  user: AppUser | null,
  { now = new Date(), onProgress }: { now?: Date; onProgress?: (done: number, total: number) => void } = {},
): Promise<ExportFile> {
  const read = await readEverything(source, onProgress)
  const tables: Record<string, unknown[]> = {}
  for (const table of EXPORT_ORDER) {
    const rows = read[table]
    if (rows) tables[table] = rows
  }
  const counts = Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, rows.length]))
  const data: DataExport = {
    app: 'Ekagra',
    format: 1,
    exportedAt: now.toISOString(),
    mode: source.kind === 'demo' ? 'demo' : 'signed_in',
    user: user ? { id: user.id, email: user.email, name: user.name } : null,
    note: FILES_NOTE,
    counts,
    tables,
  }
  return toExportFile(data, now)
}

/** Server-side GDPR export via the `account-export` Edge Function (signed-in accounts only). */
export async function exportFromServer(source: DataSource, { now = new Date() }: { now?: Date } = {}): Promise<ExportFile> {
  if (source.kind !== 'supabase') {
    throw new Error('Server GDPR export requires a signed-in account.')
  }
  const data = await callAiFunction('account-export', {}, AccountExportResponseSchema, source.client)
  const parsedDate = Number.isNaN(Date.parse(data.exportedAt)) ? now : new Date(data.exportedAt)
  return toExportFile(data, parsedDate)
}

/** Keys this app keeps on the device per person (caches), besides the stores below. */
const DEVICE_KEY_PREFIXES = ['ekagra-brief:', 'ekagra-plan-run:', 'ekagra-pdf-page:', 'ekagra-mock:']

/** Forgets what this device kept for the person: caches, the focus timer, the Launchpad and FocusGuard's blocking. */
export async function forgetOnDevice(): Promise<void> {
  try {
    const keys: string[] = []
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (key && DEVICE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) keys.push(key)
    }
    for (const key of keys) localStorage.removeItem(key)
  } catch {
    // Storage is blocked: nothing was kept.
  }
  useFocusStore.setState({ pauses: {}, activity: {}, idleOff: {}, pass: null })
  useLaunchpadStore.getState().clear()
  useModeStore.setState({ acknowledgedBlockIds: [] })
  await focusGuard.stop().catch(() => undefined)
}

/**
 * "Wipe my data" (the account stays, setup starts again) or "Delete my account" (then sign out).
 * Only for signed-in students: Demo Mode resets the data on the device instead.
 */
export function useDeleteOnServer(mode: AccountDeleteRequest['mode']) {
  const { source } = useDataSource()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const signedIn = need(source)
      if (signedIn.kind !== 'supabase') throw new Error('Demo Mode has no account: use "Reset demo data" instead.')
      const answer = await callAiFunction('account-delete', { mode, confirm: 'DELETE' }, AccountDeleteResponseSchema, signedIn.client)
      await forgetOnDevice()
      if (mode === 'account') {
        setAccountNotice('Your account and all its data were deleted.')
        await signOut()
      } else {
        // Every screen loads again; the profile now needs setup, so the app goes to onboarding.
        await queryClient.resetQueries()
      }
      return answer
    },
  })
}
