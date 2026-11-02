import { describe, expect, it, vi } from 'vitest'
import type { Subject } from '@/features/academics/subjects'
import { callAiFunction } from '@/features/ai/aiClient'
import { demoProfileRepo } from '@/features/profile/localStore'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { analyseUpload, defaultTitle, saveStudyMaterial, saveTimetable, subjectFor, subjectMentioned, typedItem, type InboxItem } from './inbox'

vi.mock('@/features/ai/aiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/ai/aiClient')>()),
  callAiFunction: vi.fn(),
}))

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const SIGNED_IN = { kind: 'supabase', userId: 'u', client: {} } as unknown as DataSource
const subject = (id: string, name: string, code: string | null = null) => ({ id, name, code }) as Subject
const SUBJECTS = [subject('id-dbms', 'Database Management Systems', 'DBMS'), subject('id-os', 'Operating Systems', 'OS')]
const pdfItem = (name: string, text: string): InboxItem => ({ name, file: null, kind: 'pdf', source: { kind: 'pdf', text, file: null, note: null }, pageCount: 4 })

describe('names and subjects', () => {
  it('names an upload after its file, or the first line of typed text', () => {
    expect(defaultTitle(pdfItem('DBMS_unit_3_notes.pdf', ''))).toBe('DBMS unit 3 notes')
    expect(defaultTitle(typedItem('\n  Submit lab record by Friday\nand more'))).toBe('Submit lab record by Friday')
  })

  it('finds a subject named in the file name or text, by code or name, as a whole word', () => {
    expect(subjectMentioned(SUBJECTS, pdfItem('DBMS_syllabus.pdf', ''))).toBe('id-dbms')
    expect(subjectMentioned(SUBJECTS, pdfItem('scan.pdf', 'Operating Systems: processes and threads'))).toBe('id-os')
    expect(subjectMentioned(SUBJECTS, pdfItem('scan.pdf', 'Costs and profits'))).toBeNull() // "os" inside a word doesn't count
  })
})

describe('analyseUpload', () => {
  it('guesses on the device in Demo Mode: the kind, a subject and a past paper year', async () => {
    const guess = await analyseUpload(DEMO, pdfItem('OS_end_sem_2024.pdf', 'Answer any five. Max marks 70.'), SUBJECTS)
    expect(guess).toMatchObject({ kind: 'past_paper', title: 'OS end sem 2024', subjectId: 'id-os', year: 2024, classes: [], guessed: true })
    expect(callAiFunction).not.toHaveBeenCalled()
  })

  it('asks the AI when signed in, with keyed subjects, and turns keys back into subjects', async () => {
    vi.mocked(callAiFunction).mockResolvedValueOnce({
      kind: 'timetable',
      title: 'Semester 3 timetable',
      summary: 'Weekly classes.',
      subjectKey: null,
      newSubject: null,
      year: null,
      classes: [
        { subject: 'DBMS', subjectKey: 's1', days: [1], start: '09:00', end: '10:00' },
        { subject: 'DBMS', subjectKey: 's1', days: [3], start: '09:00', end: '10:00' },
        { subject: 'Physics', subjectKey: null, days: [2], start: '11:00', end: '12:00' },
      ],
      model: 'claude-haiku-5-5',
      promptVersion: 'inbox-v1',
    })
    const suggestion = await analyseUpload(SIGNED_IN, pdfItem('timetable.pdf', 'Mon 9-10 DBMS'), SUBJECTS)
    expect(vi.mocked(callAiFunction).mock.calls[0]?.slice(0, 2)).toEqual([
      'ai-inbox',
      {
        fileName: 'timetable.pdf',
        text: 'Mon 9-10 DBMS',
        file: undefined,
        pageCount: 4,
        subjects: [
          { key: 's1', name: 'Database Management Systems', code: 'DBMS' },
          { key: 's2', name: 'Operating Systems', code: 'OS' },
        ],
      },
    ])
    expect(suggestion).toMatchObject({ kind: 'timetable', guessed: false })
    expect(suggestion.classes).toEqual([
      { subject: 'DBMS', subjectId: 'id-dbms', days: [1, 3], start: '09:00', end: '10:00' },
      { subject: 'Physics', subjectId: null, days: [2], start: '11:00', end: '12:00' },
    ])
  })

  it("guesses on the device, even signed in, when there's nothing the AI could read", async () => {
    vi.mocked(callAiFunction).mockClear()
    const big = await analyseUpload(SIGNED_IN, pdfItem('Physics_syllabus_scanned.pdf', ''), SUBJECTS)
    expect(big).toMatchObject({ kind: 'syllabus', guessed: true })
    expect(callAiFunction).not.toHaveBeenCalled()
  })
})

describe('filing (Demo Mode)', () => {
  it('uses the chosen subject, or makes the new one', async () => {
    expect(await subjectFor(DEMO, { subjectId: 'id-dbms', newName: 'ignored' })).toBe('id-dbms')
    expect(await subjectFor(DEMO, { subjectId: null, newName: '  ' })).toBeNull()
    const made = await subjectFor(DEMO, { subjectId: null, newName: ' Engineering Physics ' })
    expect(demoDb.get('subjects', made ?? '')?.name).toBe('Engineering Physics')
  })

  it('saves typed notes as study material under a new subject', async () => {
    const material = await saveStudyMaterial(DEMO, { item: typedItem('Joins: inner, outer, cross'), subjectId: null, newName: 'DBMS', title: 'Joins' })
    expect(material).toMatchObject({ kind: 'text', title: 'Joins' })
    expect(demoDb.get('subjects', material.subject_id ?? '')?.name).toBe('DBMS')
  })

  it("puts a timetable's classes in place of the old class times, and can add its courses as subjects", async () => {
    await demoProfileRepo.replaceRoutine([
      { kind: 'sleep', title: 'Sleep', days_of_week: [0, 1, 2, 3, 4, 5, 6], start_time: '23:00', end_time: '07:00' },
      { kind: 'class', title: 'Classes', days_of_week: [1, 2, 3, 4, 5], start_time: '09:00', end_time: '16:00' },
    ])
    const saved = await saveTimetable(DEMO, {
      classes: [
        { subject: 'DBMS', subjectId: 'id-dbms', days: [1, 3], start: '09:00', end: '10:00' },
        { subject: 'Physics', subjectId: null, days: [2], start: '11:00', end: '12:00' },
      ],
      addCourses: ['Physics'],
    })
    expect(saved).toBe(2)
    const physics = demoDb.list('subjects').find((row) => row.name === 'Physics')
    const routine = await demoProfileRepo.getRoutine()
    expect(routine.filter((row) => row.kind === 'class').map((row) => [row.title, row.days_of_week, row.subject_id])).toEqual([
      ['DBMS', [1, 3], 'id-dbms'],
      ['Physics', [2], physics?.id],
    ])
    expect(routine.some((row) => row.kind === 'sleep')).toBe(true)
  })

  it('checks the class times before making any subject', async () => {
    await expect(saveTimetable(DEMO, { classes: [{ subject: 'Lab', subjectId: null, days: [1], start: '12:00', end: '11:00' }], addCourses: ['Lab'] })).rejects.toThrow(
      /ends before it starts/,
    )
    expect(demoDb.list('subjects')).toEqual([])
    await expect(saveTimetable(DEMO, { classes: [], addCourses: [] })).rejects.toThrow(/no class times/)
  })
})
