import { ReviewRequestSchema, REVIEW_CHANGE_TYPES, REVIEW_METRICS, REVIEW_WINDOWS, type FlatReviewChange } from '@shared/schemas.ts'
import { describe, expect, it } from 'vitest'
import { METRICS } from '@/features/metrics/metrics'
import { DAY_WINDOWS } from '@/features/planner/planner'
import { readSettings } from '@/features/profile/settings'
import { CHANGE_TYPES } from './changes'
import { readReviewAnswer, toReviewRequest } from './review'
import { quietWeek, reviewContext } from './reviewTestData'

const flat = (values: Partial<FlatReviewChange> & Pick<FlatReviewChange, 'type'>): FlatReviewChange => ({
  subjectKey: null,
  window: null,
  from: null,
  to: null,
  value: null,
  metric: null,
  reason: 'From the numbers.',
  ...values,
})

describe('toReviewRequest', () => {
  const stats = quietWeek({
    subjects: [
      { id: 'dbms', name: 'DBMS', planned: 300, done: 200, attempts: 20, accuracy: 0.75 },
      { id: 'logo', name: 'Logo design', planned: 120, done: 60, attempts: 0, accuracy: null },
    ],
    topicsLearned: [{ title: 'Joins', subjectId: 'dbms' }],
    sleep: {
      nights: 4,
      avgMinutes: 413,
      regularity: 78,
      shortNights: 2,
      vsStudy: { rested: { days: 3, focusMinutes: 90, attempts: 10, accuracy: 0.9 }, short: { days: 2, focusMinutes: 15, attempts: 8, accuracy: 0.375 } },
    },
    workouts: 2,
    metrics: { memory: 0.85, learning_speed: null, processing_speed: 20, problem_solving: null },
  })
  const ctx = reviewContext({
    settings: readSettings({ planner: { subjectWindows: { dbms: 'morning', gone: 'evening' } } }),
    challenge: { metric: 'memory', target: 0.82 },
  })

  it('gives subjects short keys, with their kind, exam and weekly time, and passes ai-review’s own check', () => {
    const { request, subjectIdByKey } = toReviewRequest(stats, ctx)
    expect(request.stats.subjects.map((subject) => [subject.key, subject.name, subject.kind, subject.examInDays, subject.weeklyMinutes])).toEqual([
      ['s1', 'DBMS', 'course', 20, null],
      ['s2', 'Logo design', 'skill_course', null, 120],
    ])
    expect(request.stats.topicsLearned).toEqual([{ title: 'Joins', subjectKey: 's1' }])
    expect(request.settings.subjectWindows).toEqual({ s1: 'morning' })
    expect(request.challenge).toEqual({ metric: 'memory', target: 0.82, onTarget: true })
    expect(subjectIdByKey.get('s2')).toBe('logo')
    expect(() => ReviewRequestSchema.parse(request)).not.toThrow()
  })

  it('sends the sleep and workout numbers too', () => {
    const { request } = toReviewRequest(stats, ctx)
    expect(request.stats.sleep).toEqual(stats.sleep)
    expect(request.stats.workouts).toBe(2)
  })

  it('uses the same change types, parts of the day and metrics as the Edge Function', () => {
    expect([...REVIEW_CHANGE_TYPES]).toEqual([...CHANGE_TYPES])
    expect([...REVIEW_WINDOWS]).toEqual([...DAY_WINDOWS])
    expect([...REVIEW_METRICS]).toEqual([...METRICS])
  })
})

describe('readReviewAnswer', () => {
  it('keeps 3 insights and up to 3 changes that can really be applied', () => {
    const ctx = reviewContext({ settings: readSettings({ planner: { subjectWindows: { dbms: 'morning' } } }) })
    const read = readReviewAnswer(
      {
        insights: ['  Mornings went best. ', 'You learned Joins.', 'Instagram pulled you away.', 'A fourth one.'],
        changes: [
          flat({ type: 'move_subject_to_window', subjectKey: 's1', window: 'morning' }), // already set
          flat({ type: 'set_buffer', value: 47, reason: 'Ten blocks were missed.' }), // kept, within limits
          flat({ type: 'set_buffer', value: 20 }), // the same setting again
          flat({ type: 'move_subject_to_window', subjectKey: 's9', window: 'evening' }), // no such subject
          flat({ type: 'block_apps_in_study' }),
          flat({ type: 'set_new_cards', value: 10 }),
        ],
      },
      ctx,
      new Map([['s1', 'dbms']]),
    )
    expect(read.insights).toEqual(['Mornings went best.', 'You learned Joins.', 'Instagram pulled you away.'])
    expect(read.changes).toEqual([
      { type: 'set_buffer', value: 30, reason: 'Ten blocks were missed.', status: 'open' },
      { type: 'block_apps_in_study', reason: 'From the numbers.', status: 'open' },
      { type: 'set_new_cards', value: 10, reason: 'From the numbers.', status: 'open' },
    ])
  })
})
