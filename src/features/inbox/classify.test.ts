import { describe, expect, it } from 'vitest'
import { classifyOnDevice, yearIn } from './classify'

describe('classifyOnDevice (Demo Mode)', () => {
  it('reads the file name first', () => {
    expect(classifyOnDevice({ fileName: 'DBMS_Syllabus_2026.pdf', text: '' })).toBe('syllabus')
    expect(classifyOnDevice({ fileName: 'CSE-3rd-sem-time-table.jpg', text: '' })).toBe('timetable')
    expect(classifyOnDevice({ fileName: 'End-Sem_2024_OS.pdf', text: '' })).toBe('past_paper')
    expect(classifyOnDevice({ fileName: 'Unit3_lecture_notes.pdf', text: '' })).toBe('study_material')
  })

  it('then the words inside', () => {
    expect(classifyOnDevice({ fileName: 'scan.pdf', text: 'UNIT I: ER model. UNIT II: SQL. Course outcomes: ... Reference books: Korth' })).toBe('syllabus')
    expect(classifyOnDevice({ fileName: 'scan.pdf', text: 'Time: 3 hours. Max. marks: 70. Answer any five questions.' })).toBe('past_paper')
    expect(classifyOnDevice({ fileName: null, text: 'Monday 09:00-10:00 DBMS\nTuesday 10:00-11:00 OS\nperiod 3 lab' })).toBe('timetable')
    expect(classifyOnDevice({ fileName: null, text: 'Submit the DBMS assignment by Friday, last date for fees is tomorrow' })).toBe('task')
  })

  it('treats "due to" in notes as notes, not a deadline', () => {
    const notes = 'Deadlocks happen due to circular wait. A chapter on process synchronisation.'.repeat(5)
    expect(classifyOnDevice({ fileName: 'os.pdf', text: notes })).toBe('study_material')
  })

  it('without any tell-tale words: short typed text is a task, anything else study material', () => {
    expect(classifyOnDevice({ fileName: null, text: 'Call Rahul about the project' })).toBe('task')
    expect(classifyOnDevice({ fileName: null, text: 'x '.repeat(300) })).toBe('study_material')
    expect(classifyOnDevice({ fileName: 'IMG_2041.jpg', text: '' })).toBe('study_material')
  })
})

describe('yearIn', () => {
  it('finds an exam year in the name or the text', () => {
    expect(yearIn('OS_paper_2024.pdf', '')).toBe(2024)
    expect(yearIn('paper.pdf', 'End semester examination, December 2023')).toBe(2023)
    expect(yearIn('notes.pdf', 'Chapter 12, page 340')).toBeNull()
  })
})
