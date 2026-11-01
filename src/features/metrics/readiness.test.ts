import { describe, expect, it } from 'vitest'
import { examReadiness, isLearned, percentText } from './readiness'

const topic = (values: { status?: string; mastery?: number; priority_score?: number; track?: string; parent_id?: string | null }) => ({
  parent_id: 'unit',
  track: 'exam',
  status: 'not_started',
  mastery: 0,
  priority_score: 0.5,
  ...values,
})

describe('examReadiness', () => {
  it('is 0.4 × coverage + 0.4 × mastery + 0.2 × the latest mock, weighted by priority', () => {
    const readiness = examReadiness(
      [topic({ status: 'review', mastery: 0.9, priority_score: 0.9 }), topic({ status: 'not_started', mastery: 0, priority_score: 0.1 })],
      0.5,
    )
    // Coverage 0.9 (the important topic is learned), mastery 0.9 × 0.9 = 0.81, mock 0.5.
    expect(readiness?.coverage).toBeCloseTo(0.9)
    expect(readiness?.mastery).toBeCloseTo(0.81)
    expect(readiness?.score).toBeCloseTo(0.4 * 0.9 + 0.4 * 0.81 + 0.2 * 0.5)
    expect(readiness).toMatchObject({ mock: 0.5, examTopics: 2, learnedTopics: 1 })
  })

  it('counts a missing mock test as 0', () => {
    const readiness = examReadiness([topic({ status: 'mastered', mastery: 1 })], null)
    expect(readiness).toMatchObject({ coverage: 1, mastery: 1, mock: null })
    expect(readiness?.score).toBeCloseTo(0.8)
  })

  it('weighs every topic the same when there are no priorities yet', () => {
    const readiness = examReadiness([topic({ status: 'review', mastery: 0.8, priority_score: 0 }), topic({ status: 'learning', mastery: 0.4, priority_score: 0 })], 1)
    expect(readiness?.coverage).toBeCloseTo(0.5)
    expect(readiness?.mastery).toBeCloseTo(0.6)
  })

  it('leaves out units and the skill track, and has nothing to say without exam topics', () => {
    const readiness = examReadiness([topic({ parent_id: null, status: 'review' }), topic({ track: 'skill', status: 'review' }), topic({})], null)
    expect(readiness).toMatchObject({ examTopics: 1, learnedTopics: 0, coverage: 0 })
    expect(examReadiness([topic({ track: 'skill' })], 0.9)).toBeNull()
  })

  it('knows which topics are learned and writes shares as percentages', () => {
    expect(['not_started', 'learning', 'review', 'mastered'].map((status) => isLearned({ status }))).toEqual([false, false, true, true])
    expect(percentText(0.643)).toBe('64%')
    expect(percentText(1.2)).toBe('100%')
  })
})
