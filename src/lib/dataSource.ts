import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { useAuthStore } from '@/features/auth/authStore'
import { requireSupabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

// Where the student's data lives: this device in Demo Mode (src/lib/demoDb.ts), Supabase when
// signed in. Every feature's data functions take a DataSource and work the same way with both,
// so screens never care which one it is (AGENTS.md: every feature works in both modes).

export type DataSource =
  | { kind: 'demo' }
  | { kind: 'supabase'; client: SupabaseClient<Database>; userId: string }

/** The data source of whoever uses the app right now, and an `owner` key for query keys. */
export function useDataSource(): { source: DataSource | null; owner: string | null } {
  const status = useAuthStore((state) => state.status)
  const userId = useAuthStore((state) => state.user?.id ?? null)
  if (status === 'demo') return { source: { kind: 'demo' }, owner: 'demo' }
  if (status === 'signed_in' && userId) return { source: { kind: 'supabase', client: requireSupabase(), userId }, owner: userId }
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
  /\b(feedback|attendance|marks|semester_results|subject_ratings|metric_snapshots|challenges|weekly_reviews|habits|habit_logs|workouts|meals|sleep_logs|step_counts|speaking_sessions|shared_stats|shared_stats_view|partner_invites|partner_links|study_groups|group_members|group_sessions|nudges)\b/

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
