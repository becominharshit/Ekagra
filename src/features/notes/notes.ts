import { useQuery } from '@tanstack/react-query'
import { academicsKey } from '@/features/academics/subjects'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Tables } from '@/types/database'

// Notes, mind maps and revision sheets from Ekagra Studio (App #2, in studio/), which uses the same
// database: signed in to both apps with the same account, Studio's notes show here under each
// subject. Ekagra only reads them; Studio makes and changes them. Studio needs sign-in, so in Demo
// Mode this device's notes table stays empty.

export type Note = Tables<'notes'>
export type NoteKind = 'notes' | 'mind_map' | 'revision_sheet'
/** A note in a list: everything but its (long) text. */
export type NoteSummary = Omit<Note, 'content'>

const KIND_LABEL: Record<NoteKind, string> = { notes: 'Notes', mind_map: 'Mind map', revision_sheet: 'Revision sheet' }
const SOURCE_LABEL: Record<string, string> = { manual: 'Written in Studio', material: 'From a material', youtube: 'From a YouTube video' }

export function noteKindLabel(kind: string): string {
  return kind in KIND_LABEL ? KIND_LABEL[kind as NoteKind] : 'Notes'
}

export function noteSourceLabel(source: string): string | null {
  return SOURCE_LABEL[source] ?? null
}

/** Every column but the (long) content; Ekagra Studio's lists use it too. */
export const NOTE_SUMMARY_COLUMNS = 'id, user_id, subject_id, topic_id, material_id, kind, title, source, status, error, model, prompt_version, created_at, updated_at'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const newestFirst = (a: NoteSummary, b: NoteSummary) => Date.parse(b.updated_at) - Date.parse(a.updated_at)

/** The subject's finished notes, the most recently changed first. */
export async function listSubjectNotes(source: DataSource, subjectId: string): Promise<NoteSummary[]> {
  if (source.kind === 'demo') {
    return demoDb
      .list('notes')
      .filter((note) => note.subject_id === subjectId && note.status === 'ready')
      .sort(newestFirst)
  }
  const { data, error } = await source.client
    .from('notes')
    .select(NOTE_SUMMARY_COLUMNS)
    .eq('user_id', source.userId)
    .eq('subject_id', subjectId)
    .eq('status', 'ready')
    .order('updated_at', { ascending: false })
  if (error) throw dbError(error)
  return data
}

/** One note with its text; null when there's no note with that id (or it belongs to someone else). */
export async function getNote(source: DataSource, id: string): Promise<Note | null> {
  if (!UUID.test(id)) return null
  if (source.kind === 'demo') return demoDb.get('notes', id)
  const { data, error } = await source.client.from('notes').select('*').eq('id', id).maybeSingle()
  if (error) throw dbError(error)
  return data
}

// Studio adds and changes notes from another app or tab, so these look again (when a minute-old
// answer would be stale) whenever the student comes back to Ekagra.
const FROM_STUDIO = { staleTime: 10_000, refetchOnWindowFocus: true } as const

export function useSubjectNotes(subjectId: string | undefined) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'notes', subjectId],
    queryFn: () => listSubjectNotes(need(source), subjectId ?? ''),
    enabled: source !== null && Boolean(subjectId),
    ...FROM_STUDIO,
  })
}

/** One note. While Studio is still making it, it's checked again every `pollMs` (Studio itself checks more often). */
export function useNote(noteId: string | undefined, pollMs = 15_000) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'note', noteId],
    queryFn: () => getNote(need(source), noteId ?? ''),
    enabled: source !== null && Boolean(noteId),
    ...FROM_STUDIO,
    refetchInterval: (query) => (query.state.data?.status === 'processing' ? pollMs : false),
  })
}
