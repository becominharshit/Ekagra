import { describe, expect, it } from 'vitest'
import { readSettings } from '@/features/profile/settings'
import { localReview } from './localReview'
import { quietWeek, reviewContext } from './reviewTestData'

const share = (attempts: number, accuracy: number | null) => ({ attempts, accuracy })

/** Many missed blocks, mornings much better than nights, low retention, Instagram. */
const hardWeek = quietWeek({
  blocks: { planned: 20, done: 6, partial: 2, missed: 10, open: 2 },
  subjects: [{ id: 'dbms', name: 'DBMS', planned: 500, done: 200, attempts: 20, accuracy: 0.7 }],
  accuracyByWindow: { morning: share(10, 0.9), afternoon: share(3, 0.5), evening: share(0, null), night: share(10, 0.6) },
  reviews: { count: 30, retention: 0.7 },
  distractions: { total: 8, unlocks: 1, topApps: [{ app: 'Instagram', count: 6 }], topHours: [{ hour: 22, count: 5 }], reasons: [] },
})

describe('localReview', () => {
  it('keeps the strongest 3 insights and changes', () => {
    const review = localReview(hardWeek, reviewContext())
    expect(review.insights).toEqual([
      'You finished 6 of 18 study blocks (33%): 10 were missed and 2 ended early.',
      'Your answers were 30% more accurate in the mornings than at night.',
      'You remembered 70% of your flashcard reviews; 85–90% is the aim.',
    ])
    expect(review.changes).toEqual([
      { type: 'set_buffer', value: 17, reason: 'Many blocks were missed: more unplanned time keeps the plan realistic.', status: 'open' },
      { type: 'move_subject_to_window', subjectId: 'dbms', window: 'morning', reason: 'You answer best in the mornings.', status: 'open' },
      { type: 'set_new_cards', value: 15, reason: 'Fewer new cards a day gives the older ones room to stick.', status: 'open' },
    ])
  })

  it('skips changes that are already set, and takes the next one', () => {
    const settings = readSettings({ planner: { bufferPct: 30, subjectWindows: { dbms: 'morning' } } })
    const types = localReview(hardWeek, reviewContext({ settings })).changes.map((change) => change.type)
    // The buffer is at its maximum and DBMS is already in the mornings: the best focus hours move instead.
    expect(types).toEqual(['set_peak_window', 'set_new_cards', 'block_apps_in_study'])
  })

  it('suggests finishing topics two weeks before an exam 15–30 days away, and next week’s challenge', () => {
    const week = quietWeek({ metrics: { memory: 0.7, learning_speed: null, processing_speed: 25, problem_solving: 0.5 } })
    const review = localReview(week, reviewContext({ metrics: week.metrics, challenge: { metric: 'problem_solving', target: 0.6 } }))
    expect(review.insights).toEqual(["DBMS's exam is in 20 days."])
    expect(review.changes.map((change) => change.type)).toEqual(['set_revision_days', 'challenge_metric'])
    expect(review.changes[1]).toMatchObject({ metric: 'memory', reason: 'Memory has the most room to grow (70% this week).' })
  })

  it('praises a good week and changes nothing', () => {
    const good = quietWeek({
      blocks: { planned: 20, done: 18, partial: 1, missed: 1, open: 0 },
      reviews: { count: 25, retention: 0.92 },
      topicsLearned: [
        { title: 'Joins', subjectId: 'dbms' },
        { title: 'Keys', subjectId: 'dbms' },
      ],
    })
    const review = localReview(good, reviewContext({ subjects: new Map() }))
    expect(review.insights).toEqual([
      'You finished 90% of your study blocks (18 of 20). Keep it going.',
      'You learned 2 topics: Joins, Keys.',
      'You remembered 92% of 25 flashcard reviews: your memory is working well.',
    ])
    expect(review.changes).toEqual([])
  })

  it('says so when there was little to measure', () => {
    const review = localReview(quietWeek(), reviewContext({ subjects: new Map() }))
    expect(review.insights).toEqual(['There was little to measure this week. Plan a few study blocks and mark them done, and next week brings a real review.'])
    expect(review.changes).toEqual([])
  })
})
