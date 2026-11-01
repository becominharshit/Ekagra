import { describe, expect, it } from 'vitest'
import { handleAiRequest, type ServerDeps } from '../_shared/http.ts'
import type { ReviewRequest } from '../_shared/schemas.ts'
import { fakeModel, memoryUsage, modelAnswer, TEST_SECRETS } from '../_shared/testing.ts'
import { reviewFeature } from './feature.ts'

const share = (attempts: number, accuracy: number | null) => ({ attempts, accuracy })

const REQUEST: ReviewRequest = {
  weekStart: '2026-11-02',
  mentorTone: 'balanced',
  stats: {
    areas: {
      academics: { planned: 900, done: 520, budgetPct: 55, sharePct: 60 },
      hustle: { planned: 300, done: 250, budgetPct: 25, sharePct: 29 },
      life: { planned: 200, done: 90, budgetPct: 20, sharePct: 11 },
    },
    blocks: { planned: 28, done: 14, partial: 4, missed: 8, open: 2 },
    subjects: [
      { key: 's1', name: 'DBMS', kind: 'course', planned: 500, done: 300, attempts: 30, accuracy: 0.7, examInDays: 20, weeklyMinutes: null },
      { key: 's2', name: 'Logo design', kind: 'skill_course', planned: 120, done: 60, attempts: 0, accuracy: null, examInDays: null, weeklyMinutes: 120 },
    ],
    topicsLearned: [{ title: 'Joins', subjectKey: 's1' }],
    quiz: share(30, 0.7),
    accuracyByWindow: { morning: share(12, 0.85), afternoon: share(5, 0.6), evening: share(8, 0.62), night: share(10, 0.5) },
    reviews: { count: 60, retention: 0.78 },
    focus: { minutes: 610, sessions: 14, completed: 11 },
    distractions: { total: 9, unlocks: 2, topApps: [{ app: 'Instagram', count: 6 }], topHours: [{ hour: 22, count: 5 }], reasons: [{ reason: 'urgent', count: 2 }] },
    checkIns: { days: 5, energy: 3.2, mood: 3.6, crashedDays: 0 },
    tasks: { completed: 6, overdue: 1 },
    hustle: { minutes: 250, income: [{ currency: 'INR', amount: 2000 }] },
    metrics: { memory: 0.78, learning_speed: null, processing_speed: 21, problem_solving: 0.55 },
  },
  settings: {
    budget: { academics: 55, hustle: 25, life: 20 },
    bufferPct: 12,
    maxReviewMinutes: 30,
    newCardsPerDay: 20,
    maxBlockMinutes: 50,
    revisionDays: 10,
    peak: { start: '09:00', end: '13:00' },
    blockAppsInStudy: false,
    subjectWindows: {},
  },
  challenge: { metric: 'memory', target: 0.82, onTarget: false },
}

const change = (values: Record<string, unknown>) => ({ subjectKey: null, window: null, from: null, to: null, value: null, metric: null, reason: 'From the numbers.', ...values })
const ANSWER = {
  insights: ['You finished 14 of 26 blocks.', 'Your answers were 35% more accurate in the mornings than at night.', 'Instagram pulled you away 6 times, mostly around 22:00.'],
  changes: [change({ type: 'move_subject_to_window', subjectKey: 's1', window: 'morning' }), change({ type: 'set_new_cards', value: 15 }), change({ type: 'block_apps_in_study' })],
}

async function call(body: unknown, ...answers: unknown[]) {
  const model = fakeModel(...answers.map((answer) => modelAnswer(JSON.stringify(answer))))
  const usage = memoryUsage()
  const deps = (): ServerDeps => ({ env: TEST_SECRETS, authenticate: async () => 'student-1', usage, model: () => model })
  const response = await handleAiRequest(reviewFeature, deps)(new Request('http://localhost/ai-review', { method: 'POST', body: JSON.stringify(body) }))
  return { response, model, usage }
}

describe('ai-review', () => {
  it('writes 3 insights and up to 3 changes on the Smart tier, and logs the usage', async () => {
    const { response, usage } = await call(REQUEST, ANSWER)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ...ANSWER, model: 'smart-model', promptVersion: 'review-v1' })
    expect(usage.logged).toEqual([expect.objectContaining({ feature: 'review', model: 'smart-model' })])
  })

  it('gives the model the numbers, the settings, the challenge and the list of changes it may use', async () => {
    const { model } = await call(REQUEST, ANSWER)
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    for (const part of ['Week starting 2026-11-02', 'Instagram', '\\"bufferPct\\":12', "This week's challenge: memory, target 0.82", 'set_skill_minutes', "Don't suggest what is already set"]) {
      expect(prompt).toContain(part)
    }
  })

  it('asks again when a change is incomplete or names the wrong kind of subject', async () => {
    const broken = [
      { ...ANSWER, changes: [change({ type: 'move_subject_to_window', subjectKey: 's2', window: 'morning' })] }, // a skill course
      { ...ANSWER, changes: [change({ type: 'set_buffer' })] }, // no value
      { ...ANSWER, changes: [change({ type: 'shift_budget', from: 'life', to: 'life', value: 5 })] },
    ]
    for (const answer of broken) {
      const { response, model } = await call(REQUEST, answer, ANSWER)
      expect(response.status).toBe(200)
      expect(model.doGenerateCalls).toHaveLength(2)
    }
  })

  it('rejects numbers that make no sense', async () => {
    const { response } = await call({ ...REQUEST, stats: { ...REQUEST.stats, reviews: { count: 5, retention: 4 } } }, ANSWER)
    expect(response.status).toBe(400)
  })
})
