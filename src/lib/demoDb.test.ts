import { describe, expect, it, vi } from 'vitest'
import { stubLocalStorage } from '@/test/memoryStorage'
import { demoDb } from './demoDb'

stubLocalStorage()

describe('demoDb', () => {
  it('fills in the id, owner, timestamps and column defaults, like Postgres', () => {
    const [subject] = demoDb.insert('subjects', [{ name: 'DBMS' }])
    expect(subject).toMatchObject({ name: 'DBMS', kind: 'course', exam_date: null, user_id: 'demo-user' })
    expect(subject?.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(Date.parse(subject?.created_at ?? '')).not.toBeNaN()
    expect(demoDb.list('subjects')).toEqual([subject])
  })

  it('keeps an id that is given, so rows can point at each other before saving', () => {
    demoDb.insert('subjects', [{ id: 'subject-1', name: 'DBMS' }])
    demoDb.insert('topics', [{ id: 'topic-1', subject_id: 'subject-1', title: 'SQL' }])
    expect(demoDb.get('topics', 'topic-1')).toMatchObject({ subject_id: 'subject-1', track: 'exam', priority_score: 0 })
    expect(demoDb.get('topics', 'missing')).toBeNull()
  })

  it('updates a row, never its id or owner, and moves updated_at', () => {
    vi.useFakeTimers({ now: new Date('2026-11-01T10:00:00Z') })
    const [subject] = demoDb.insert('subjects', [{ name: 'DBMS' }])
    vi.setSystemTime(new Date('2026-11-01T11:00:00Z'))
    const updated = demoDb.update('subjects', subject?.id ?? '', { name: 'Databases', id: 'hacked', user_id: 'someone' })
    vi.useRealTimers()

    expect(updated).toMatchObject({ id: subject?.id, user_id: 'demo-user', name: 'Databases' })
    expect(updated.updated_at).toBe('2026-11-01T11:00:00.000Z')
    expect(updated.created_at).toBe('2026-11-01T10:00:00.000Z')
    expect(() => demoDb.update('subjects', 'missing', { name: 'x' })).toThrow(/no subjects row/)
  })

  it('deletes linked rows, or clears the link, like the foreign keys do', () => {
    demoDb.insert('subjects', [{ id: 's', name: 'DBMS' }])
    demoDb.insert('topics', [
      { id: 'unit', subject_id: 's', title: 'Unit 1' },
      { id: 'sql', subject_id: 's', parent_id: 'unit', title: 'SQL' },
    ])
    demoDb.insert('flashcards', [{ id: 'card', topic_id: 'sql', front: 'Q', back: 'A' }])
    demoDb.insert('mistakes', [{ id: 'm', topic_id: 'sql', concept: 'Joins' }])

    demoDb.remove('subjects', ['s'])

    expect(demoDb.list('topics')).toEqual([]) // the unit, and the topic inside it
    expect(demoDb.list('flashcards')).toEqual([]) // cards belong to their topic
    expect(demoDb.get('mistakes', 'm')).toMatchObject({ topic_id: null, concept: 'Joins' }) // kept, unlinked
  })

  it('clears every demo table', () => {
    demoDb.insert('subjects', [{ name: 'DBMS' }])
    demoDb.insert('flashcards', [{ front: 'Q', back: 'A' }])
    demoDb.clear()
    expect(demoDb.list('subjects')).toEqual([])
    expect(demoDb.list('flashcards')).toEqual([])
  })

  it('treats broken saved data as empty, and explains when storage is full', () => {
    localStorage.setItem('ekagra-demo-db:subjects', '{not json')
    expect(demoDb.list('subjects')).toEqual([])

    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    expect(() => demoDb.insert('subjects', [{ name: 'DBMS' }])).toThrow(/storage on this device is full/)
    vi.restoreAllMocks()
  })
})
