import { describe, expect, it } from 'vitest'
import {
  hasActivity,
  median,
  metricShortLabel,
  metricValueLabel,
  toMetric,
  weekMetrics,
  weekPoints,
  weekStartOf,
  weekValues,
  type Metric,
  type MetricInputs,
} from './metrics'

// The week of Monday 2 November 2026 (local time).
const WEEK = new Date(2026, 10, 2)
const at = (day: number, hour = 10) => new Date(2026, 10, day, hour).toISOString()

const empty: MetricInputs = { reviews: [], attempts: [], questionDifficulty: new Map(), topics: [], topicMinutes: [], focus: [] }

describe('weekStartOf and median', () => {
  it('starts weeks on Monday', () => {
    expect(weekStartOf(new Date(2026, 10, 8, 23))).toEqual(WEEK) // Sunday evening
    expect(weekStartOf(new Date(2026, 10, 2, 0, 5))).toEqual(WEEK)
  })

  it('takes the middle value', () => {
    expect(median([5, 1, 3])).toBe(3)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeNull()
  })
})

describe('weekMetrics', () => {
  it('says nothing about a week with too little practice', () => {
    const metrics = weekMetrics(empty, WEEK)
    expect(metrics).toMatchObject({ weekStart: '2026-11-02', memory: null, learningSpeed: null, processingSpeed: null, problemSolving: null, focusMinutes: 0 })
    expect(hasActivity(metrics)).toBe(false)
  })

  it('works out memory from reviews and re-tests after 7 days', () => {
    const inputs: MetricInputs = {
      ...empty,
      // 4 reviews this week, 3 rated Good or Easy; one review last week doesn't count.
      reviews: [3, 4, 2, 3].map((rating, index) => ({ rating, reviewed_at: at(3 + index) })).concat([{ rating: 1, reviewed_at: at(1) }]),
      attempts: [
        { question_id: 'q1', is_correct: false, time_ms: null, created_at: at(20 - 31) }, // 20 October… (a month before)
        { question_id: 'q1', is_correct: true, time_ms: null, created_at: at(4) }, // re-test, right
        { question_id: 'q2', is_correct: true, time_ms: null, created_at: at(2) },
        { question_id: 'q2', is_correct: false, time_ms: null, created_at: at(5) }, // 3 days later: not a re-test
      ],
    }
    const metrics = weekMetrics(inputs, WEEK)
    // (3 good reviews + 1 right re-test) of (4 reviews + 1 re-test) = 80%.
    expect(metrics.memory).toBe(0.8)
    expect(metrics.details).toMatchObject({ reviews: 4, retests: 1 })
  })

  it('works out processing speed (median seconds per right answer) and problem solving (first tries on hard questions)', () => {
    const attempts = [
      ...[10_000, 20_000, 30_000, 40_000, 50_000].map((time, index) => ({ question_id: `easy${index}`, is_correct: true, time_ms: time, created_at: at(3) })),
      { question_id: 'wrong', is_correct: false, time_ms: 5000, created_at: at(3) }, // wrong answers don't count for speed
      { question_id: 'hard1', is_correct: true, time_ms: null, created_at: at(4) },
      { question_id: 'hard2', is_correct: false, time_ms: null, created_at: at(4) },
      { question_id: 'hard3', is_correct: true, time_ms: null, created_at: at(4) },
      { question_id: 'hard3', is_correct: false, time_ms: null, created_at: at(5) }, // not a first try
    ]
    const questionDifficulty = new Map<string, number | null>([
      ['hard1', 3],
      ['hard2', 5],
      ['hard3', 4],
      ['easy0', 1],
    ])
    const metrics = weekMetrics({ ...empty, attempts, questionDifficulty }, WEEK)
    expect(metrics.processingSpeed).toBe(30)
    // Right first tries weigh 3 + 4 of 3 + 5 + 4 = 7 / 12.
    expect(metrics.problemSolving).toBeCloseTo(0.5833, 4)
    expect(metrics.details).toMatchObject({ timedAnswers: 5, firstTries: 3 })
  })

  it('works out learning speed from the topics learned that week', () => {
    const inputs: MetricInputs = {
      ...empty,
      topics: [
        { id: 'joins', est_minutes: 90, learned_at: at(4) },
        { id: 'keys', est_minutes: 60, learned_at: at(6) },
        { id: 'old', est_minutes: 60, learned_at: at(1) }, // learned last week
        { id: 'no-time', est_minutes: 30, learned_at: at(5) }, // studied outside the plan: no minutes known
      ],
      topicMinutes: [
        { topic_id: 'joins', minutes: 60, date: '2026-10-30' },
        { topic_id: 'joins', minutes: 40, date: '2026-11-03' },
        { topic_id: 'joins', minutes: 30, date: '2026-11-07' }, // after it was learned
        { topic_id: 'keys', minutes: 50, date: '2026-11-06' },
      ],
    }
    const metrics = weekMetrics(inputs, WEEK)
    // (90 + 60) planned ÷ (100 + 50) spent = 1.0
    expect(metrics.learningSpeed).toBe(1)
    expect(metrics.details.learnedTopics).toBe(2)
  })

  it('adds up focus minutes of the week', () => {
    const metrics = weekMetrics({ ...empty, focus: [{ started_at: at(3), actual_minutes: 50 }, { started_at: at(8, 20), actual_minutes: 25 }, { started_at: at(9), actual_minutes: 30 }] }, WEEK)
    expect(metrics.focusMinutes).toBe(75)
    expect(hasActivity(metrics)).toBe(true)
  })
})

describe('weeks for charts', () => {
  it('lines up saved weeks, weeks without practice and this week so far, oldest first', () => {
    const thisWeek = weekMetrics({ ...empty, focus: [{ started_at: at(10), actual_minutes: 40 }] }, new Date(2026, 10, 9))
    const saved = { week_start: '2026-10-26', memory: '0.8500', learning_speed: null, processing_speed: 21.5, problem_solving: null, focus_minutes: 120 }
    const points = weekPoints([saved], thisWeek, 3)
    expect(points.map((point) => [point.weekStart, point.values.memory, point.focusMinutes, point.live])).toEqual([
      ['2026-10-26', 0.85, 120, false],
      ['2026-11-02', null, 0, false],
      ['2026-11-09', null, 40, true],
    ])
    expect(points[0]?.values.processing_speed).toBe(21.5)
  })

  it('reads metric names and writes short labels', () => {
    expect(toMetric('problem_solving')).toBe('problem_solving')
    expect(toMetric('iq')).toBe('memory')
    expect(weekValues({ memory: 0.9, learningSpeed: 1.2, processingSpeed: null, problemSolving: 0.5 })).toEqual({ memory: 0.9, learning_speed: 1.2, processing_speed: null, problem_solving: 0.5 })
    expect(['memory', 'learning_speed', 'processing_speed'].map((metric, index) => metricShortLabel(metric as Metric, [0.864, 1.25, 14.4][index] ?? 0))).toEqual(['86%', '1.3×', '14 s'])
  })
})

describe('metricValueLabel', () => {
  it('shows each metric in its own unit', () => {
    expect(metricValueLabel('memory', 0.864)).toBe('86%')
    expect(metricValueLabel('learning_speed', 1.25)).toBe('1.3× the plan')
    expect(metricValueLabel('processing_speed', 14.4)).toBe('14 s')
    expect(metricValueLabel('problem_solving', null)).toBe('–')
  })
})
