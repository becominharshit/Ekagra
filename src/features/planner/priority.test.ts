import { describe, expect, it } from 'vitest'
import { countDependents, priorityScores, type PriorityInput } from './priority'

function topic(
  id: string,
  examWeight: number,
  pyqCount: number,
  pyqMarksShare: number,
  prerequisiteIds: string[] = [],
): PriorityInput {
  return { id, examWeight, pyqCount, pyqMarksShare, prerequisiteIds }
}

// C needs B and B needs A: A unlocks two topics, B unlocks one.
const CHAIN = [topic('A', 0.8, 4, 0.3), topic('B', 0.4, 2, 0.1, ['A']), topic('C', 0.2, 0, 0, ['B'])]

describe('countDependents', () => {
  it('counts the topics that need a topic, directly or through a chain', () => {
    expect(Object.fromEntries(countDependents(CHAIN))).toEqual({ A: 2, B: 1, C: 0 })
  })

  it('does not loop forever on circular prerequisites', () => {
    const circle = [topic('X', 1, 0, 0, ['Y']), topic('Y', 1, 0, 0, ['X'])]
    expect(Object.fromEntries(countDependents(circle))).toEqual({ X: 1, Y: 1 })
  })

  it('ignores prerequisites from other subjects', () => {
    expect(Object.fromEntries(countDependents([topic('A', 1, 0, 0, ['somewhere-else'])]))).toEqual({ A: 0 })
  })
})

describe('priorityScores', () => {
  it('uses 0.45 × exam weight + 0.35 × past papers + 0.20 × dependents', () => {
    const scores = priorityScores(CHAIN)
    expect(scores.get('A')?.score).toBe(1) // strongest in every part
    // B: 0.45 × 0.4/0.8 + 0.35 × (0.5 × 2/4 + 0.5 × 0.1/0.3) + 0.20 × 1/2 = 0.4708
    expect(scores.get('B')?.score).toBe(0.4708)
    // C: 0.45 × 0.2/0.8 = 0.1125 (never asked, nothing depends on it)
    expect(scores.get('C')?.score).toBe(0.1125)
  })

  it('scales each part within the subject', () => {
    const equal = [topic('P', 0.3, 0, 0), topic('Q', 0.3, 0, 0)]
    expect(priorityScores(equal).get('P')).toMatchObject({ examPart: 1, pyqPart: 0, dependentsPart: 0, score: 0.45 })
  })

  it('gives 0 instead of dividing by zero when a subject has no data yet', () => {
    expect(priorityScores([topic('new', 0, 0, 0)]).get('new')?.score).toBe(0)
  })

  it('always returns a score from 0 to 1 with at most 4 decimals', () => {
    for (const { score } of priorityScores(CHAIN).values()) {
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(1)
      expect(Number(score.toFixed(4))).toBe(score)
    }
  })
})
