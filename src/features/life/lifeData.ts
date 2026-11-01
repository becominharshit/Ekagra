import { useMutation, useQueryClient } from '@tanstack/react-query'
import { need, useDataSource, type DataSource } from '@/lib/dataSource'

/** Every Life query key starts with this, so one refresh after a change updates them all. */
export const lifeKey = (owner: string | null) => ['life', owner] as const

/** A change to Life data (Supabase or Demo Mode). Afterwards every Life view reloads. */
export function useLifeMutation<Variables>(run: (source: DataSource, variables: Variables) => Promise<void>) {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: Variables) => run(need(source), variables),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: lifeKey(owner) })
    },
  })
}
