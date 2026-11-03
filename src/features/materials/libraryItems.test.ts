import { describe, expect, it } from 'vitest'
import type { NoteSummary } from '@/features/notes/notes'
import { ALL_SUBJECTS, libraryItems, NO_SUBJECT } from './libraryItems'
import type { Material } from './materials'

const material = (id: string, kind: string, subjectId: string | null, createdAt: string) =>
  ({ id, kind, subject_id: subjectId, title: id, created_at: createdAt, page_count: null, duration_sec: null }) as Material
const note = (id: string, subjectId: string, updatedAt: string) => ({ id, kind: 'notes', subject_id: subjectId, title: id, source: 'youtube', updated_at: updatedAt }) as NoteSummary

const MATERIALS = [
  material('book.pdf', 'pdf', 'dbms', '2026-11-01T10:00:00.000Z'),
  material('lecture', 'youtube', 'dbms', '2026-11-03T09:00:00.000Z'),
  material('board', 'image', null, '2026-11-02T10:00:00.000Z'),
  material('typed', 'text', 'maths', '2026-10-30T10:00:00.000Z'),
]
const NOTES = [note('joins notes', 'dbms', '2026-11-03T10:00:00.000Z'), note('limits map', 'maths', '2026-10-31T10:00:00.000Z')]
const titles = (subject: string, type: Parameters<typeof libraryItems>[2]['type']) =>
  libraryItems(MATERIALS, NOTES, { subject, type }).map((item) => (item.kind === 'material' ? item.material.title : item.note.title))

describe('the Library list', () => {
  it('shows materials of every kind and the notes from Studio together, the newest first', () => {
    expect(titles(ALL_SUBJECTS, 'all')).toEqual(['joins notes', 'lecture', 'board', 'book.pdf', 'limits map', 'typed'])
  })

  it('opens PDFs in the PDF viewer, other materials on their own page and notes in the reader', () => {
    const where = Object.fromEntries(libraryItems(MATERIALS, NOTES, { subject: ALL_SUBJECTS, type: 'all' }).map((item) => [item.id, item.to]))
    expect(where).toEqual({
      'book.pdf': '/academics/library/book.pdf',
      lecture: '/academics/materials/lecture',
      board: '/academics/materials/board',
      typed: '/academics/materials/typed',
      'joins notes': '/academics/notes/joins notes',
      'limits map': '/academics/notes/limits map',
    })
  })

  it('filters by subject, including materials with no subject', () => {
    expect(titles('dbms', 'all')).toEqual(['joins notes', 'lecture', 'book.pdf'])
    expect(titles(NO_SUBJECT, 'all')).toEqual(['board'])
  })

  it('filters by type: PDFs, YouTube videos, notes, or photos and text', () => {
    expect(titles(ALL_SUBJECTS, 'pdf')).toEqual(['book.pdf'])
    expect(titles(ALL_SUBJECTS, 'youtube')).toEqual(['lecture'])
    expect(titles(ALL_SUBJECTS, 'notes')).toEqual(['joins notes', 'limits map'])
    expect(titles(ALL_SUBJECTS, 'other')).toEqual(['board', 'typed'])
    expect(titles('maths', 'notes')).toEqual(['limits map'])
  })
})
