import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { addMark, deleteMark, deleteSemesterResult, listMarks, listSemesterResults, markProblem, saveSemesterResult, semesterProblem } from './gradesData'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }

describe('marks in Demo Mode', () => {
  it('adds marks in date order, refuses impossible ones, and deletes them with the subject', async () => {
    const [subject] = demoDb.insert('subjects', [{ name: 'DBMS', credits: 4 }])
    const subjectId = subject?.id ?? ''
    await addMark(DEMO, { subjectId, assessment: ' Internal 2 ', obtained: 18, maxMarks: 20, date: '2026-11-20' })
    await addMark(DEMO, { subjectId, assessment: 'Internal 1', obtained: 24.5, maxMarks: 30, date: '2026-10-01' })
    expect((await listMarks(DEMO)).map((mark) => mark.assessment)).toEqual(['Internal 1', 'Internal 2'])
    await expect(addMark(DEMO, { subjectId, assessment: 'Quiz', obtained: 11, maxMarks: 10, date: null })).rejects.toThrow(/more than the maximum/)

    const [first] = await listMarks(DEMO)
    await deleteMark(DEMO, first?.id ?? '')
    expect((await listMarks(DEMO)).map((mark) => mark.assessment)).toEqual(['Internal 2'])
    demoDb.remove('subjects', [subjectId])
    expect(await listMarks(DEMO)).toEqual([])
  })

  it('explains what is wrong with marks', () => {
    expect(markProblem({ assessment: ' ', obtained: 1, maxMarks: 10 })).toMatch(/Name the test/)
    expect(markProblem({ assessment: 'Lab', obtained: 1, maxMarks: 0 })).toMatch(/more than 0/)
    expect(markProblem({ assessment: 'Lab', obtained: -1, maxMarks: 10 })).toMatch(/negative/)
    expect(markProblem({ assessment: 'Lab', obtained: 10, maxMarks: 10 })).toBeNull()
  })
})

describe('earlier semesters in Demo Mode', () => {
  it('keeps one result per semester: saving it again changes it', async () => {
    await saveSemesterResult(DEMO, { semester: 2, sgpa: 8.1, credits: 24 })
    await saveSemesterResult(DEMO, { semester: 1, sgpa: 7.6, credits: 22 })
    await saveSemesterResult(DEMO, { semester: 2, sgpa: 8.3, credits: 24 })
    expect((await listSemesterResults(DEMO)).map((row) => [row.semester, row.sgpa])).toEqual([
      [1, 7.6],
      [2, 8.3],
    ])
    const [first] = await listSemesterResults(DEMO)
    await deleteSemesterResult(DEMO, first?.id ?? '')
    expect((await listSemesterResults(DEMO)).map((row) => row.semester)).toEqual([2])
  })

  it('checks the semester, SGPA and credits', async () => {
    expect(semesterProblem({ semester: 0, sgpa: 8, credits: 20 })).toMatch(/1 to 16/)
    expect(semesterProblem({ semester: 3, sgpa: 10.5, credits: 20 })).toMatch(/0 to 10/)
    expect(semesterProblem({ semester: 3, sgpa: 8, credits: 0 })).toMatch(/Credits/)
    await expect(saveSemesterResult(DEMO, { semester: 3, sgpa: 11, credits: 20 })).rejects.toThrow(/0 to 10/)
  })
})
