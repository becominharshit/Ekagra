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

/** A note still 'processing' after this long has stopped (the server's time limit ended its work). */
export const STUCK_AFTER_MS = 10 * 60 * 1000

/** Whether a note is still being made: 'processing', and not for so long that it has stopped. */
export function stillMaking(note: Pick<NoteSummary, 'status' | 'created_at'>, now = Date.now()): boolean {
  return note.status === 'processing' && now - Date.parse(note.created_at) < STUCK_AFTER_MS
}

/** Saves the student's changes to a note (its title, its Markdown). */
export async function updateNote(source: DataSource, { id, title, content }: { id: string; title: string; content: string }): Promise<void> {
  const clean = title.trim().slice(0, 200)
  if (!clean) throw new Error('Give it a title.')
  const patch = { title: clean, content: content.slice(0, 500_000) }
  if (source.kind === 'demo') {
    demoDb.update('notes', id, patch)
    return
  }
  const { error } = await source.client.from('notes').update(patch).eq('id', id)
  if (error) throw dbError(error)
}

/** Deletes a note in both apps. */
export async function deleteNote(source: DataSource, id: string): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.remove('notes', [id])
    return
  }
  const { error } = await source.client.from('notes').delete().eq('id', id)
  if (error) throw dbError(error)
}

export function useStudioNotes(by: { subjectId: string } | { materialId: string } | null) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'studio-notes', by],
    queryFn: () => listStudioNotes(need(source), by ?? { subjectId: '' }),
    enabled: source !== null && by !== null,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    // A note being made in the background is checked every 10 seconds until it's done (or has stopped).
    refetchInterval: (query) => (query.state.data?.some((note) => stillMaking(note)) ? 10_000 : false),
  })
}
