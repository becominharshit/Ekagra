import { useMutation, useQueryClient } from '@tanstack/react-query'
import { academicsKey } from '@/features/academics/subjects'
import { hustlesKey } from '@/features/hustle/hustles'
import { planKey } from '@/features/planner/planBlocks'
import { need, useDataSource, type DataSource } from '@/lib/dataSource'

/**
 * A change made from Today. Afterwards the plan reloads, and so do Academics (e.g. a topic that
 * was started) and Hustle (focus time on a hustle block counts as its hours).
 */
export function useTodayMutation<Variables, Result>(run: (source: DataSource, variables: Variables) => Promise<Result>) {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: Variables) => run(need(source), variables),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: planKey(owner) }),
        queryClient.invalidateQueries({ queryKey: academicsKey(owner) }),
        queryClient.invalidateQueries({ queryKey: hustlesKey(owner) }),
      ])
    },
  })
}
