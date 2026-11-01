import { describe, expect, it } from 'vitest'
import { countLabel, examLabel, minutesLabel } from './labels'

describe('labels', () => {
  it('counts the days to the exam', () => {
    const today = '2026-11-01'
    expect(examLabel('2026-12-01', today)).toBe('Exam in 30 days')
    expect(examLabel('2026-11-02', today)).toBe('Exam tomorrow')
    expect(examLabel('2026-11-01', today)).toBe('Exam today')
    expect(examLabel('2026-10-29', today)).toBe('Exam was 3 days ago')
    expect(examLabel(null, today)).toBe('No exam date')
  })

  it('writes minutes as hours and minutes', () => {
    expect([minutesLabel(45), minutesLabel(120), minutesLabel(150)]).toEqual(['45 min', '2 h', '2 h 30 min'])
  })

  it('counts in singular or plural', () => {
    expect([countLabel(1, 'topic'), countLabel(0, 'topic'), countLabel(3, 'topic')]).toEqual(['1 topic', '0 topics', '3 topics'])
  })
})
