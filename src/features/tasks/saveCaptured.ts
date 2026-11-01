import { useMutation, useQueryClient } from '@tanstack/react-query'
import { hustlesKey, type Hustle } from '@/features/hustle/hustles'
import { addItem, listItems } from '@/features/hustle/items'
import { need, useDataSource, type DataSource } from '@/lib/dataSource'
import { draftDueAt, draftValues, type TaskDraft } from './drafts'
import { addTasks, tasksKey } from './tasks'

// Saving what the + Capture sheet found: to-dos become tasks, and hustle leads become cards in
// the first column of that hustle's pipeline board (e.g. "Proposal" for freelancing).

export interface CapturedFrom {
  source: 'text' | 'screenshot' | 'manual'
  /** The typed text or the screenshot's file name. */
  ref: string | null
}

export async function saveCaptured(
  source: DataSource,
  { drafts, hustles, from }: { drafts: TaskDraft[]; hustles: Hustle[]; from: CapturedFrom },
): Promise<void> {
  const hustleOf = (draft: TaskDraft) => (draft.area === 'hustle' && draft.asCard ? hustles.find((hustle) => hustle.id === draft.hustleId) : undefined)
  await addTasks(
    source,
    drafts.filter((draft) => !hustleOf(draft)).map((draft) => ({ ...draftValues(draft), source: from.source, source_ref: from.ref })),
  )
  for (const draft of drafts) {
    const hustle = hustleOf(draft)
    const stage = hustle?.pipeline_stages[0]
    if (!hustle || stage === undefined) continue
    // At the end of the first column.
    const column = (await listItems(source, hustle.id)).filter((item) => item.stage === stage)
    const after = column.reduce<number | null>((last, item) => (last === null || item.order_index > last ? item.order_index : last), null)
    await addItem(source, {
      hustle,
      stage,
      fields: { title: draft.title, amount: null, dueAt: draftDueAt(draft), url: null, notes: null, clientId: null },
      after,
    })
  }
}

/** Saves captured tasks and leads; afterwards tasks and hustles reload (and the plan follows). */
export function useSaveCaptured() {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: Parameters<typeof saveCaptured>[1]) => saveCaptured(need(source), variables),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: tasksKey(owner) }), queryClient.invalidateQueries({ queryKey: hustlesKey(owner) })])
    },
  })
}
