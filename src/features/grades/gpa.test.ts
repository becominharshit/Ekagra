import { describe, expect, it } from 'vitest'
import { cgpa, DEFAULT_GRADE_SCALE, gpaLabel, gradeForPercent, gradePoints, marksTotal, requiredSgpa, scaleProblems, sgpa } from './gpa'

const scale = DEFAULT_GRADE_SCALE

describe('the grade scale', () => {
  it('gives the 10-point values: O = 10, A+ = 9 … P = 4, F = 0', () => {
    expect(scale.map((step) => `${step.letter}=${step.points}`)).toEqual(['O=10', 'A+=9', 'A=8', 'B+=7', 'B=6', 'C=5', 'P=4', 'F=0'])
    expect(gradePoints(scale, 'B+')).toBe(7)
    expect(gradePoints(scale, 'Z')).toBeNull()
    expect(gradePoints(scale, null)).toBeNull()
  })

  it('suggests the grade a total % reaches', () => {
    expect(gradeForPercent(scale, 91)?.letter).toBe('O')
    expect(gradeForPercent(scale, 80)?.letter).toBe('A+')
    expect(gradeForPercent(scale, 79.99)?.letter).toBe('A')
    expect(gradeForPercent(scale, 44)?.letter).toBe('P')
    expect(gradeForPercent(scale, 12)?.letter).toBe('F')
    expect(gradeForPercent(scale, null)).toBeNull()
  })

  it('finds problems in an edited scale', () => {
    expect(scaleProblems(scale)).toEqual([])
    expect(scaleProblems([{ letter: 'A', points: 9, minPercent: 80 }])).toEqual(['A scale needs at least two grades.'])
    expect(
      scaleProblems([
        { letter: 'A', points: 11, minPercent: 80 },
        { letter: 'A', points: 5, minPercent: 120 },
      ]),
    ).toEqual(['Two grades have the same name.', 'Grade points go from 0 to 10.', 'Cut-offs go from 0 to 100%.'])
  })
})

describe('SGPA', () => {
  it('weights grade points by credits', () => {
    // (4 × 9 + 3 × 8 + 2 × 10 + 1 × 7) ÷ 10 = 8.7
    const result = sgpa(
      [
        { credits: 4, grade: 'A+' },
        { credits: 3, grade: 'A' },
        { credits: 2, grade: 'O' },
        { credits: 1, grade: 'B+' },
      ],
      scale,
    )
    expect(result.sgpa).toBeCloseTo(8.7)
    expect(result).toMatchObject({ credits: 10, missing: 0 })
  })

  it('leaves out subjects without credits, and counts the ones still waiting for a grade', () => {
    const result = sgpa(
      [
        { credits: 4, grade: 'A' },
        { credits: null, grade: 'O' }, // no credits: doesn't count
        { credits: 3, grade: null }, // no grade yet
        { credits: 1.5, grade: 'F' }, // a fail counts as 0 points
      ],
      scale,
    )
    expect(result.sgpa).toBeCloseTo((4 * 8) / 5.5)
    expect(result).toMatchObject({ credits: 5.5, missing: 1 })
    expect(sgpa([], scale)).toEqual({ sgpa: null, credits: 0, missing: 0 })
  })
})

describe('CGPA', () => {
  it('weights each semester by its credits', () => {
    // (20 × 8 + 25 × 9) ÷ 45 = 8.555…
    expect(cgpa([{ credits: 20, sgpa: 8 }, { credits: 25, sgpa: 9 }]).cgpa).toBeCloseTo(8.5556, 4)
    expect(cgpa([])).toEqual({ cgpa: null, credits: 0 })
  })

  it('works out the SGPA needed this semester for a target CGPA', () => {
    // Earlier: 40 credits at 7.5 (300 points). Target 8 over 60 credits = 480 points → 180 ÷ 20 = 9.
    expect(requiredSgpa(8, [{ credits: 40, sgpa: 7.5 }], 20)).toBeCloseTo(9)
    // Out of reach this semester: above 10.
    expect(requiredSgpa(9, [{ credits: 40, sgpa: 7 }], 20)).toBeGreaterThan(10)
    // No earlier semesters: the target itself.
    expect(requiredSgpa(8.5, [], 22)).toBeCloseTo(8.5)
    expect(requiredSgpa(8, [], 0)).toBeNull()
  })

  it('shows GPAs with two decimals', () => {
    expect(gpaLabel(8.555555)).toBe('8.56')
    expect(gpaLabel(8.7)).toBe('8.70')
    expect(gpaLabel(8.455)).toBe('8.46')
    expect(gpaLabel(null)).toBe('–')
  })
})

describe('marks', () => {
  it('adds up obtained and maximum marks (the database may send numbers as text)', () => {
    expect(marksTotal([{ obtained: 24.5, max_marks: 30 }, { obtained: 8, max_marks: 10 }])).toEqual({ obtained: 32.5, max: 40, percent: 81.25 })
    expect(marksTotal([{ obtained: '18' as unknown as number, max_marks: '20' as unknown as number }]).percent).toBe(90)
    expect(marksTotal([])).toEqual({ obtained: 0, max: 0, percent: null })
  })
})
