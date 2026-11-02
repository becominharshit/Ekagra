import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { deleteNote, listStudioNotes, STUCK_AFTER_MS, stillMaking, updateNote } from './studioNotes'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }

describe("Studio's notes", () => {
  it('lists the notes of a subject or a material, of every status, newest first', async () => {
    const [subject] = demoDb.insert('subjects', [{ name: 'DBMS' }])
    const [material] = demoDb.insert('materials', [{ kind: 'youtube', title: 'Joins' }])
    if (!subject || !material) throw new Error('No rows')
    demoDb.insert('notes', [
      { subject_id: subject.id, material_id: material.id, title: 'Old', updated_at: '2026-11-01T10:00:00.000Z' },
      { subject_id: subject.id, material_id: material.id, title: 'Making', status: 'processing', updated_at: '2026-11-02T10:00:00.000Z' },
      { subject_id: subject.id, title: 'Failed', status: 'failed', updated_at: '2026-11-01T12:00:00.000Z' },
    ])
    expect((await listStudioNotes(DEMO, { subjectId: subject.id })).map((note) => note.title)).toEqual(['Making', 'Failed', 'Old'])
    expect((await listStudioNotes(DEMO, { materialId: material.id })).map((note) => note.title)).toEqual(['Making', 'Old'])
  })

  it('saves edits and deletes', async () => {
    const [subject] = demoDb.insert('subjects', [{ name: 'DBMS' }])
    const [note] = demoDb.insert('notes', [{ subject_id: subject?.id ?? '', title: 'Joins' }])
    if (!note) throw new Error('No note')
    await updateNote(DEMO, { id: note.id, title: '  SQL joins ', content: '## Inner' })
    expect(demoDb.get('notes', note.id)).toMatchObject({ title: 'SQL joins', content: '## Inner' })
    await expect(updateNote(DEMO, { id: note.id, title: ' ', content: '' })).rejects.toThrow(/title/)
    await deleteNote(DEMO, note.id)
    expect(demoDb.get('notes', note.id)).toBeNull()
  })

  it("counts a note as still being made only for 10 minutes: then the server's time limit has stopped it", () => {
    const now = Date.parse('2026-11-02T10:00:00.000Z')
    const at = (msAgo: number) => new Date(now - msAgo).toISOString()
    expect(stillMaking({ status: 'processing', created_at: at(60_000) }, now)).toBe(true)
    expect(stillMaking({ status: 'processing', created_at: at(STUCK_AFTER_MS + 1) }, now)).toBe(false)
    expect(stillMaking({ status: 'ready', created_at: at(0) }, now)).toBe(false)
  })
})
