import { describe, expect, it } from 'vitest'
import { challengeGoal, clampTarget, isOnTarget, nextTarget, planChallenge, startTarget, type ChallengeWeek } from './challenge'

const week = (target: number, achieved: boolean, value: number | null = null, metric: ChallengeWeek['metric'] = 'problem_solving'): ChallengeWeek => ({ metric, target, achieved, value })

describe('targets', () => {
  it('starts 5% better than the baseline, within sensible limits', () => {
    expect(startTarget('problem_solving', 0.6)).toBe(0.63)
    expect(startTarget('processing_speed', 20)).toBe(19)
    expect(startTarget('memory', 0.88)).toBe(0.9) // memory stops at 90%
    expect(clampTarget('processing_speed', 0.4)).toBe(1)
  })

  it('knows when a week is on target (fewer seconds is better for processing speed)', () => {
    expect(isOnTarget('memory', 0.9, 0.88)).toBe(true)
    expect(isOnTarget('memory', 0.87, 0.88)).toBe(false)
    expect(isOnTarget('processing_speed', 18, 19)).toBe(true)
    expect(isOnTarget('processing_speed', 20, 19)).toBe(false)
    expect(isOnTarget('memory', null, 0.5)).toBe(false) // not enough practice counts as missed
  })
})

describe('nextTarget', () => {
  it('gets 5% harder after two weeks on target, 10% when both beat it by 10% or more', () => {
    expect(nextTarget('problem_solving', [week(0.6, true, 0.62), week(0.6, true, 0.61)])).toBe(0.63)
    expect(nextTarget('problem_solving', [week(0.6, true, 0.7), week(0.6, true, 0.68)])).toBe(0.66)
  })

  it('gets 5% easier after two weeks missed, and stays after a mixed pair', () => {
    expect(nextTarget('problem_solving', [week(0.6, false), week(0.6, false)])).toBe(0.57)
    expect(nextTarget('problem_solving', [week(0.6, true), week(0.6, false)])).toBe(0.6)
  })

  it('needs two weeks at the same target: a fresh target starts counting again', () => {
    expect(nextTarget('problem_solving', [week(0.6, true), week(0.6, true), week(0.63, true)])).toBe(0.63)
    expect(nextTarget('problem_solving', [week(0.6, true)])).toBe(0.6)
    expect(nextTarget('memory', [week(0.6, true)])).toBeNull()
  })

  it('takes seconds off processing speed when it gets harder', () => {
    const fast = (achieved: boolean): ChallengeWeek => ({ metric: 'processing_speed', target: 20, achieved, value: 19 })
    expect(nextTarget('processing_speed', [fast(true), fast(true)])).toBe(19)
    expect(nextTarget('processing_speed', [fast(false), fast(false)])).toBe(21)
  })
})

describe('planChallenge', () => {
  const latest = { memory: null, learning_speed: 1.1, processing_speed: 25, problem_solving: 0.5 }

  it('starts with the first metric measured last time', () => {
    expect(planChallenge([], latest)).toEqual({ metric: 'learning_speed', baseline: 1.1, target: 1.155 })
  })

  it('keeps the last metric and adapts its target', () => {
    expect(planChallenge([week(0.5, false), week(0.5, false)], latest)).toEqual({ metric: 'problem_solving', baseline: 0.5, target: 0.475 })
  })

  it('waits while nothing could be measured', () => {
    expect(planChallenge([], null)).toBeNull()
    expect(planChallenge([], { memory: null, learning_speed: null, processing_speed: null, problem_solving: null })).toBeNull()
  })

  it('says the goal in words', () => {
    expect(challengeGoal('memory', 0.88)).toBe('remember 88% or more of what you review')
    expect(challengeGoal('processing_speed', 19)).toBe('answer right in 19 seconds or less (median)')
    expect(challengeGoal('processing_speed', 20.9)).toBe('answer right in 20.9 seconds or less (median)')
  })
})
