import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/features/auth/authStore'
import { defaultCurrencyForLocale } from '@/lib/currency'
import { dbError, type DataSource } from '@/lib/dataSource'
import { deviceFiles } from '@/lib/deviceFiles'
import { requireSupabase, supabase } from '@/lib/supabase'
import { browserTimezone } from '@/lib/timezone'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'
import { clearDemoData, demoProfileRepo } from './localStore'
import { mergeSettings, type SettingsPatch } from './settings'

export type ProfileRow = Tables<'profiles'>
export type RoutineRow = Tables<'routine_blocks'>
export type ProfileUpdate = TablesUpdate<'profiles'>
/** A new routine row; the database fills in id, user_id and the timestamps. */
export type RoutineInsert = Omit<TablesInsert<'routine_blocks'>, 'id' | 'user_id' | 'created_at' | 'updated_at'>

/** Where the profile and routine are kept: Supabase when signed in, this device in Demo Mode.
 *  Screens only use the hooks below, so they work the same way in both. */
export interface ProfileRepo {
  getProfile(): Promise<ProfileRow | null>
  saveProfile(patch: ProfileUpdate): Promise<void>
  getRoutine(): Promise<RoutineRow[]>
  replaceRoutine(rows: RoutineInsert[]): Promise<void>
}

export async function ensureProfile(
  userId: string,
  meta?: { fullName?: string | null; avatarUrl?: string | null; email?: string | null },
): Promise<ProfileRow | null> {
  if (!supabase) return null
  const existing = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (existing.error) throw dbError(existing.error)
  if (existing.data) return existing.data

  const fallbackName = meta?.fullName?.trim() || meta?.email?.split('@')[0]?.trim() || 'Student'
  const { error: insertError } = await supabase.from('profiles').upsert(
    {
      id: userId,
      full_name: fallbackName,
      avatar_url: meta?.avatarUrl ?? null,
      timezone: browserTimezone(),
      currency: defaultCurrencyForLocale(),
    },
    { onConflict: 'id', ignoreDuplicates: true },
  )
  if (insertError) throw dbError(insertError)

  const created = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (created.error) throw dbError(created.error)
  return created.data
}

function supabaseRepo(userId: string): ProfileRepo {
  const client = requireSupabase()
  return {
    async getProfile() {
      const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle()
      if (error) throw dbError(error)
      if (data) return data
      const authUser = useAuthStore.getState().user
      return ensureProfile(userId, {
        fullName: authUser?.name,
        avatarUrl: authUser?.avatarUrl,
        email: authUser?.email,
      })
    },
    async saveProfile(patch) {
      const { error } = await client.from('profiles').update(patch).eq('id', userId)
      if (error) throw dbError(error)
    },
    async getRoutine() {
      const { data, error } = await client.from('routine_blocks').select('*').eq('user_id', userId).order('start_time')
      if (error) throw dbError(error)
      return data
    },
    async replaceRoutine(rows) {
      // Save the new routine first and only then remove the old one,
      // so a failure halfway never leaves the student with no routine at all.
      const { data: old, error: readError } = await client.from('routine_blocks').select('id').eq('user_id', userId)
      if (readError) throw dbError(readError)
      if (rows.length > 0) {
        const { error } = await client.from('routine_blocks').insert(rows)
        if (error) throw dbError(error)
      }
      const oldIds = old.map((row) => row.id)
      if (oldIds.length > 0) {
        const { error } = await client.from('routine_blocks').delete().in('id', oldIds)
        if (error) throw dbError(error)
      }
    },
  }
}

/** The profile storage of a data source, for code that runs outside React (e.g. re-planning). */
export function profileRepoFor(source: DataSource): ProfileRepo {
  return source.kind === 'demo' ? demoProfileRepo : supabaseRepo(source.userId)
}

/** The storage for whoever is using the app right now (null while signed out). */
function useRepo(): { repo: ProfileRepo | null; owner: string | null } {
  const status = useAuthStore((state) => state.status)
  const userId = useAuthStore((state) => state.user?.id ?? null)
  if (status === 'demo') return { repo: demoProfileRepo, owner: 'demo' }
  if (status === 'signed_in' && userId) return { repo: supabaseRepo(userId), owner: userId }
  return { repo: null, owner: null }
}

export function useProfile() {
  const { repo, owner } = useRepo()
  return useQuery({
    queryKey: ['profile', owner],
    queryFn: async () => {
      if (!repo) throw new Error('Please sign in again.')
      return repo.getProfile()
    },
    enabled: repo !== null,
  })
}

export function useRoutine() {
  const { repo, owner } = useRepo()
  return useQuery({
    queryKey: ['routine', owner],
    queryFn: async () => {
      if (!repo) throw new Error('Please sign in again.')
      return repo.getRoutine()
    },
    enabled: repo !== null,
  })
}

export interface OnboardingResult {
  profile: ProfileUpdate
  routine: RoutineInsert[]
}

/** Saves the onboarding answers. The profile goes last, so "onboarded" is only set when the routine saved too. */
export function useSaveOnboarding() {
  const { repo, owner } = useRepo()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (result: OnboardingResult) => {
      if (!repo) throw new Error('Please sign in again.')
      await repo.replaceRoutine(result.routine)
      await repo.saveProfile(result.profile)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profile', owner] })
      await queryClient.invalidateQueries({ queryKey: ['routine', owner] })
    },
  })
}

/** Skips full setup while initializing locale defaults + onboarded timestamp so Today's planner runs immediately. */
export function useSkipOnboarding() {
  const { repo, owner } = useRepo()
  const authName = useAuthStore((state) => state.user?.name ?? null)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (current?: ProfileRow | null) => {
      if (!repo) throw new Error('Please sign in again.')
      const fallbackName = current?.full_name?.trim() || authName?.trim() || 'Student'
      await repo.saveProfile({
        full_name: fallbackName,
        timezone: current?.timezone || browserTimezone(),
        currency: current?.currency || defaultCurrencyForLocale(),
        onboarded_at: current?.onboarded_at ?? new Date().toISOString(),
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profile', owner] })
    },
  })
}

/** Saves some settings, e.g. { focus: { defaultMode: 'deep' } }. The other saved settings stay as they are. */
export function useSaveSettings() {
  const { repo, owner } = useRepo()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (patch: SettingsPatch) => {
      if (!repo) throw new Error('Please sign in again.')
      // Read fresh, so a change made elsewhere meanwhile isn't overwritten.
      const profile = await repo.getProfile()
      await repo.saveProfile({ settings: mergeSettings(profile?.settings, patch) })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profile', owner] })
    },
  })
}

/** Demo Mode only: deletes all demo data from this device, so setup starts again. */
export function useResetDemoData() {
  const queryClient = useQueryClient()
  return async () => {
    clearDemoData()
    // Demo Mode's PDFs live in IndexedDB; if that is blocked there is nothing to delete.
    await deviceFiles.clear().catch(() => undefined)
    // Every screen reloads its data (subjects, flashcards, …), not only the profile.
    await queryClient.invalidateQueries()
  }
}
