import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Tables } from '@/types/database'

// The apps FocusGuard blocks during focus (blocked_apps), in Supabase or (Demo Mode) on the
// device. Turning one off keeps its row (active = false), so it's remembered in the list.

export type BlockedApp = Tables<'blocked_apps'>

export const blockedAppsKey = (owner: string | null) => ['blocked-apps', owner] as const

export async function listBlockedApps(source: DataSource): Promise<BlockedApp[]> {
  if (source.kind === 'demo') return demoDb.list('blocked_apps')
  const { data, error } = await source.client.from('blocked_apps').select('*').eq('user_id', source.userId)
  if (error) throw dbError(error)
  return data
}

/** Turns blocking an app on or off (its row is made the first time). */
export async function setAppBlocked(source: DataSource, { packageName, label, blocked }: { packageName: string; label: string; blocked: boolean }): Promise<void> {
  if (source.kind === 'demo') {
    const existing = demoDb.list('blocked_apps').find((row) => row.package_name === packageName)
    if (existing) demoDb.update('blocked_apps', existing.id, { active: blocked, label })
    else demoDb.insert('blocked_apps', [{ package_name: packageName, label, active: blocked }])
    return
  }
  const { error } = await source.client
    .from('blocked_apps')
    .upsert({ user_id: source.userId, package_name: packageName, label, active: blocked }, { onConflict: 'user_id,package_name' })
  if (error) throw dbError(error)
}

/** The packages to block right now. */
export function blockedPackages(rows: Pick<BlockedApp, 'package_name' | 'active'>[]): string[] {
  return rows.filter((row) => row.active).map((row) => row.package_name)
}

export function useBlockedApps() {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: blockedAppsKey(owner),
    queryFn: () => listBlockedApps(need(source)),
    enabled: source !== null,
  })
}

export function useSetAppBlocked() {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: { packageName: string; label: string; blocked: boolean }) => setAppBlocked(need(source), variables),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: blockedAppsKey(owner) })
    },
  })
}
