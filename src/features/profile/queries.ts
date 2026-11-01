import type { PostgrestError } from '@supabase/supabase-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/features/auth/authStore'
import { requireSupabase } from '@/lib/supabase'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'
import { clearDemoData, demoProfileRepo } from './localStore'

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

function friendlyError(error: PostgrestError): Error {
  if (error.code === 'PGRST205' || error.code === '42P01') {
    return new Error(
      "The database tables don't exist yet. Run `npm run db:push` (docs/4-setup-guide.md, step 2), then try again.",
    )
  }
  return new Error(error.message)
}

function supabaseRepo(userId: string): ProfileRepo {
  const client = requireSupabase()
  return {
    async getProfile() {
      const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle()
      if (error) throw friendlyError(error)
      return data
    },
    async saveProfile(patch) {
      const { error } = await client.from('profiles').update(patch).eq('id', userId)
      if (error) throw friendlyError(error)
    },
    async getRoutine() {
      const { data, error } = await client.from('routine_blocks').select('*').eq('user_id', userId).order('start_time')
      if (error) throw friendlyError(error)
      return data
    },
    async replaceRoutine(rows) {
      // Save the new routine first and only then remove the old one,
      // so a failure halfway never leaves the student with no routine at all.
      const { data: old, error: readError } = await client.from('routine_blocks').select('id').eq('user_id', userId)
      if (readError) throw friendlyError(readError)
      if (rows.length > 0) {
        const { error } = await client.from('routine_blocks').insert(rows)
        if (error) throw friendlyError(error)
      }
      const oldIds = old.map((row) => row.id)
      if (oldIds.length > 0) {
        const { error } = await client.from('routine_blocks').delete().in('id', oldIds)
        if (error) throw friendlyError(error)
      }
    },
  }
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

/** Demo Mode only: deletes all demo data from this device, so setup starts again. */
export function useResetDemoData() {
  const queryClient = useQueryClient()
  return async () => {
    clearDemoData()
    // Every screen reloads its data (subjects, flashcards, …), not only the profile.
    await queryClient.invalidateQueries()
  }
}
