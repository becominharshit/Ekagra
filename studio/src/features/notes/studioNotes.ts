import { useQuery } from '@tanstack/react-query'
import { academicsKey } from '@/features/academics/subjects'
import { NOTE_SUMMARY_COLUMNS, type NoteSummary } from '@/features/notes/notes'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'

// Notes in Studio, which makes them (Ekagra only shows the finished ones, see src/features/notes).
// Studio's lists also show notes still being made and ones that failed, and check again while any
// is being made.

const newestFirst = (a: NoteSummary, b: NoteSummary) => Date.parse(b.updated_at) - Date.parse(a.updated_at)

/** Notes of a subject or made from a material, of every status, newest first. */
export async function listStudioNotes(source: DataSource, by: { subjectId: string } | { materialId: string }): Promise<NoteSummary[]> {
  const matches = (note: NoteSummary) => ('subjectId' in by ? note.subject_id === by.subjectId : note.material_id === by.materialId)
  if (source.kind === 'demo') return demoDb.list('notes').filter(matches).sort(newestFirst)
  const query = source.client.from('notes').select(NOTE_SUMMARY_COLUMNS).eq('user_id', source.userId)
  const { data, error } = await ('subjectId' in by ? query.eq('subject_id', by.subjectId) : query.eq('material_id', by.materialId)).order('updated_at', {
    ascending: false,
  })
  if (error) throw dbError(error)
  return data
}

export function useStudioNotes(by: { subjectId: string } | { materialId: string } | null) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'studio-notes', by],
    queryFn: () => listStudioNotes(need(source), by ?? { subjectId: '' }),
    enabled: source !== null && by !== null,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    // A note being made in the background is checked every 10 seconds until it's done.
    refetchInterval: (query) => (query.state.data?.some((note) => note.status === 'processing') ? 10_000 : false),
  })
}
