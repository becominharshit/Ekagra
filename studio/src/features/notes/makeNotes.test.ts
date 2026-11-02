import { describe, expect, it, vi } from 'vitest'
import { callAiFunction } from '@/features/ai/aiClient'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import type { Material } from '@studio/features/library/library'
import { makeNotes, notesSource, textForNotes } from './makeNotes'

vi.mock('@/features/ai/aiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/ai/aiClient')>()),
  callAiFunction: vi.fn(),
}))

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const material = (patch: Partial<Material>) => ({ id: 'm1', kind: 'youtube', title: 'Lecture 4: joins', source_url: 'https://www.youtube.com/watch?v=9hE5-98ZeCg', subject_id: 's1', ...patch }) as Material

describe('textForNotes', () => {
  it('keeps whole pages until the limit, and says which page was the last one', () => {
    const pages = ['a'.repeat(40), 'b'.repeat(40), 'c'.repeat(40)]
    expect(textForNotes(pages, 5, 100)).toEqual({ text: `${'a'.repeat(40)}\n\n${'b'.repeat(40)}`, lastPage: 6 })
    expect(textForNotes(pages, 1, 1000).lastPage).toBe(3)
  })

  it('cuts a first page that is too long on its own', () => {
    expect(textForNotes(['x'.repeat(500)], 1, 100)).toEqual({ text: 'x'.repeat(100), lastPage: 1 })
  })
})

describe('what Gemini reads', () => {
  it('a YouTube video by its link, and a text material by its text', async () => {
    expect(await notesSource(DEMO, material({}))).toEqual({ source: { kind: 'youtube', url: 'https://www.youtube.com/watch?v=9hE5-98ZeCg' }, pages: null })
    demoDb.insert('material_pages', [{ material_id: 'm2', page_no: 1, text: '  BCNF notes  ' }])
    expect(await notesSource(DEMO, material({ id: 'm2', kind: 'text' }))).toEqual({ source: { kind: 'text', text: 'BCNF notes' }, pages: null })
  })

  it('refuses empty text and kinds it cannot read', async () => {
    await expect(notesSource(DEMO, material({ id: 'm3', kind: 'text' }))).rejects.toThrow(/empty/)
    await expect(notesSource(DEMO, material({ kind: 'drive' }))).rejects.toThrow(/can't make notes from this kind/)
  })
})

describe('makeNotes', () => {
  it('asks studio-notes with the material, subject, kind and level, and returns the new note', async () => {
    vi.mocked(callAiFunction).mockResolvedValueOnce({ noteId: '33333333-3333-4333-8333-333333333333' })
    const signedIn = { kind: 'supabase', userId: 'u', client: {} } as unknown as DataSource
    const noteId = await makeNotes(signedIn, { material: material({}), kind: 'mind_map', subjectId: 's1', program: 'BTech CSE', year: 1 })
    expect(noteId).toBe('33333333-3333-4333-8333-333333333333')
    expect(vi.mocked(callAiFunction).mock.calls[0]?.slice(0, 2)).toEqual([
      'studio-notes',
      {
        materialId: 'm1',
        subjectId: 's1',
        kind: 'mind_map',
        title: 'Lecture 4: joins',
        source: { kind: 'youtube', url: 'https://www.youtube.com/watch?v=9hE5-98ZeCg' },
        program: 'BTech CSE',
        year: 1,
      },
    ])
  })

  it('needs sign-in', async () => {
    await expect(makeNotes(DEMO, { material: material({}), kind: 'notes', subjectId: 's1' })).rejects.toThrow(/signed in/)
  })
})
