import { describe, expect, it } from 'vitest'
import { gradeAnswers, gradeOnDevice, keyWords } from './grading'

describe('keyWords', () => {
  it('keeps the words that carry meaning, with plurals folded', () => {
    expect([...keyWords('Normalisation removes redundancy from the tables and the table')]).toEqual(['normalisation', 'remove', 'redundancy', 'table'])
  })
})

describe('gradeOnDevice', () => {
  const item = { key: 'a1', question: 'Define a primary key.', marks: 4, answer: '' }

  it('gives 0 for an empty answer', () => {
    expect(gradeOnDevice(item)).toMatchObject({ awarded: 0, by: 'device' })
  })

  it('counts the key points the answer covers', () => {
    const grade = gradeOnDevice({ ...item, answer: 'It uniquely identifies every row in a table.', keyPoints: ['uniquely identifies each row', 'cannot be null'] })
    expect(grade.awarded).toBe(2)
    expect(grade.missing).toEqual(['cannot be null'])
    expect(grade.feedback).toMatch(/1 of 2 key points/)
  })

  it('compares with the model answer when there are no key points', () => {
    const grade = gradeOnDevice({ ...item, answer: 'A primary key uniquely identifies rows.', modelAnswer: 'A primary key uniquely identifies each row; it is unique and never null.' })
    expect(grade.awarded).toBeGreaterThan(1)
    expect(grade.awarded).toBeLessThanOrEqual(4)
    expect(grade.modelAnswer).toMatch(/never null/)
  })

  it('leaves it to the student when there is nothing to compare with', () => {
    expect(gradeOnDevice({ ...item, answer: 'Something' })).toMatchObject({ awarded: null })
  })

  it('marks everything on the device in Demo Mode', async () => {
    const grades = await gradeAnswers({ kind: 'demo' }, { subject: 'DBMS', items: [{ ...item, answer: 'unique row', keyPoints: ['unique row'] }] })
    expect(grades).toEqual([expect.objectContaining({ key: 'a1', awarded: 4, by: 'device' })])
  })
})
