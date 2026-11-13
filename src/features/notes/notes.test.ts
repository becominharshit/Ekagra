import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { extractNoteHeadings, getNote, listNotes, listSubjectNotes, noteKindLabel, noteSourceLabel, seedSampleNotes } from './notes'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }

describe('notes in Demo Mode', () => {
  it("lists a subject's finished notes, the most recently changed first", async () => {
    const [dbms, maths] = demoDb.insert('subjects', [{ name: 'DBMS' }, { name: 'Maths' }])
    if (!dbms || !maths) throw new Error('No subjects')
    const [older, newer] = demoDb.insert('notes', [
      { subject_id: dbms.id, title: 'ER model', updated_at: '2026-11-01T10:00:00.000Z' },
      { subject_id: dbms.id, title: 'SQL', kind: 'revision_sheet', updated_at: '2026-11-02T10:00:00.000Z' },
      { subject_id: dbms.id, title: 'Joins', status: 'processing' },
      { subject_id: maths.id, title: 'Limits' },
    ])

    const notes = await listSubjectNotes(DEMO, dbms.id)
    expect(notes.map((note) => note.title)).toEqual(['SQL', 'ER model'])
    expect(await getNote(DEMO, older?.id ?? '')).toMatchObject({ title: 'ER model', content: '' })
    expect((await getNote(DEMO, newer?.id ?? ''))?.kind).toBe('revision_sheet')
  })

  it('lists the finished notes of every subject for the Library, the most recently changed first', async () => {
    const [dbms, maths] = demoDb.insert('subjects', [{ name: 'DBMS' }, { name: 'Maths' }])
    if (!dbms || !maths) throw new Error('No subjects')
    demoDb.insert('notes', [
      { subject_id: dbms.id, title: 'ER model', updated_at: '2026-11-01T10:00:00.000Z' },
      { subject_id: maths.id, title: 'Limits', kind: 'mind_map', updated_at: '2026-11-02T10:00:00.000Z' },
      { subject_id: dbms.id, title: 'Still being made', status: 'processing' },
      { subject_id: dbms.id, title: 'Failed', status: 'failed' },
    ])
    expect((await listNotes(DEMO)).map((note) => note.title)).toEqual(['Limits', 'ER model'])
  })

  it('finds nothing for an unknown or broken id', async () => {
    expect(await getNote(DEMO, crypto.randomUUID())).toBeNull()
    expect(await getNote(DEMO, 'not-a-note')).toBeNull()
  })

  it('seeds a sample lecture note and mind map once for a subject in Demo Mode', async () => {
    const [dbms] = demoDb.insert('subjects', [{ name: 'DBMS' }])
    if (!dbms) throw new Error('No subject')
    const seeded = await seedSampleNotes(DEMO, dbms.id)
    expect(seeded.map((note) => note.kind)).toEqual(['notes', 'mind_map'])
    expect(extractNoteHeadings(seeded[0]?.content ?? '').length).toBeGreaterThanOrEqual(4)
    const again = await seedSampleNotes(DEMO, dbms.id)
    expect(again).toHaveLength(2)
  })
})

describe('table of contents headings', () => {
  it('extracts ## headings in order and ignores # titles and fenced code blocks', () => {
    const markdown = [
      '# Lecture Title',
      '## Overview',
      '```python',
      '## comment inside code fence',
      '```',
      '## **Gauss’s Law** (14:20)',
      '## Permeability $\\mu_r$ and $\\mur$',
      '### Sub-bullet heading',
      '## Key points',
    ].join('\n')
    expect(extractNoteHeadings(markdown)).toEqual([
      { id: 'sec-overview', text: 'Overview' },
      { id: 'sec-gauss-s-law-14-20', text: 'Gauss’s Law (14:20)' },
      { id: 'sec-permeability-mu-r-and-mu-r', text: 'Permeability $\\mu_r$ and $\\mu_r$' },
      { id: 'sec-key-points', text: 'Key points' },
    ])
  })
})

describe('notes when signed in', () => {
  function fakeSupabase(rows: unknown[]) {
    const calls: unknown[][] = []
    const query = {
      select: (columns: string) => {
        calls.push(['select', columns])
        return query
      },
      eq: (column: string, value: string) => {
        calls.push(['eq', column, value])
        return query
      },
      order: async (column: string, options: unknown) => {
        calls.push(['order', column, options])
        return { data: rows, error: null }
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    }
    const client = {
      from: (table: string) => {
        calls.push(['from', table])
        return query
      },
    }
    return { source: { kind: 'supabase', userId: 'student-1', client } as unknown as DataSource, calls }
  }

  it("asks for the student's finished notes of that subject, without their text", async () => {
    const { source, calls } = fakeSupabase([{ id: 'n1', title: 'SQL' }])
    expect(await listSubjectNotes(source, 'subject-1')).toEqual([{ id: 'n1', title: 'SQL' }])
    const columns = calls.find((call) => call[0] === 'select')?.[1]
    expect(columns).toEqual(expect.stringContaining('title'))
    expect(columns).not.toEqual(expect.stringContaining('content'))
    expect(calls.filter((call) => call[0] !== 'select')).toEqual([
      ['from', 'notes'],
      ['eq', 'user_id', 'student-1'],
      ['eq', 'subject_id', 'subject-1'],
      ['eq', 'status', 'ready'],
      ['order', 'updated_at', { ascending: false }],
    ])
  })

  it("asks for every finished note of the student, without their text, a page at a time", async () => {
    const calls: unknown[][] = []
    const query = {
      select: (columns: string) => (calls.push(['select', columns]), query),
      eq: (column: string, value: string) => (calls.push(['eq', column, value]), query),
      order: (column: string, options: unknown) => (calls.push(['order', column, options]), query),
      range: async (from: number, to: number) => (calls.push(['range', from, to]), { data: [{ id: 'n1', title: 'SQL' }], error: null }),
    }
    const source = { kind: 'supabase', userId: 'student-1', client: { from: (table: string) => (calls.push(['from', table]), query) } } as unknown as DataSource
    expect(await listNotes(source)).toEqual([{ id: 'n1', title: 'SQL' }])
    expect(calls.find((call) => call[0] === 'select')?.[1]).not.toEqual(expect.stringContaining('content'))
    expect(calls.filter((call) => call[0] !== 'select')).toEqual([
      ['from', 'notes'],
      ['eq', 'user_id', 'student-1'],
      ['eq', 'status', 'ready'],
      ['order', 'updated_at', { ascending: false }],
      ['range', 0, 999],
    ])
  })

  it("doesn't ask the database about an id that can't be a note's", async () => {
    const { source, calls } = fakeSupabase([])
    expect(await getNote(source, '../materials')).toBeNull()
    expect(calls).toEqual([])
  })
})

describe('labels', () => {
  it('names kinds and sources in plain words', () => {
    expect([noteKindLabel('notes'), noteKindLabel('mind_map'), noteKindLabel('revision_sheet'), noteKindLabel('something new')]).toEqual([
      'Notes',
      'Mind map',
      'Revision sheet',
      'Notes',
    ])
    expect([noteSourceLabel('youtube'), noteSourceLabel('material'), noteSourceLabel('manual'), noteSourceLabel('other')]).toEqual([
      'From a YouTube video',
      'From a material',
      'Written in Studio',
      null,
    ])
  })
})
