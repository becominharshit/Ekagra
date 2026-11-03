import type { NoteSummary } from '@/features/notes/notes'
import { materialPath, type Material } from './materials'

// The Library's one list: study materials of every kind (PDFs, YouTube videos, photos, text) and
// the notes, mind maps and revision sheets Ekagra Studio made, filtered by subject and type, the
// newest first. Pure, tested in libraryItems.test.ts.

export const ALL_SUBJECTS = 'all'
export const NO_SUBJECT = 'none'

export const LIBRARY_TYPES = ['all', 'pdf', 'youtube', 'notes', 'other'] as const
export type LibraryType = (typeof LIBRARY_TYPES)[number]

export const LIBRARY_TYPE_LABEL: Record<LibraryType, string> = {
  all: 'Everything',
  pdf: 'PDFs',
  youtube: 'YouTube videos',
  notes: 'Notes and mind maps',
  other: 'Photos and text',
}

export type LibraryItem =
  | { kind: 'material'; id: string; at: string; to: string; material: Material }
  | { kind: 'note'; id: string; at: string; to: string; note: NoteSummary }

export function isLibraryType(value: string | null): value is LibraryType {
  return (LIBRARY_TYPES as readonly string[]).includes(value ?? '')
}

function materialShown(kind: string, type: LibraryType): boolean {
  if (type === 'all') return true
  if (type === 'pdf' || type === 'youtube') return kind === type
  return type === 'other' && kind !== 'pdf' && kind !== 'youtube'
}

/** `subject` is a subject's id, ALL_SUBJECTS or NO_SUBJECT (notes always have a subject). */
export function libraryItems(materials: Material[], notes: NoteSummary[], { subject, type }: { subject: string; type: LibraryType }): LibraryItem[] {
  const inSubject = (subjectId: string | null) => subject === ALL_SUBJECTS || (subject === NO_SUBJECT ? subjectId === null : subjectId === subject)
  const items: LibraryItem[] = [
    ...materials
      .filter((material) => inSubject(material.subject_id) && materialShown(material.kind, type))
      .map((material): LibraryItem => ({ kind: 'material', id: material.id, at: material.created_at, to: materialPath(material), material })),
    ...(type === 'all' || type === 'notes' ? notes : [])
      .filter((note) => inSubject(note.subject_id))
      .map((note): LibraryItem => ({ kind: 'note', id: note.id, at: note.updated_at, to: `/academics/notes/${note.id}`, note })),
  ]
  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}
