import type { Tables } from '@/types/database'

// Exam readiness per subject (docs/2-technical-design.md §9):
//   readiness = 0.4 × coverage + 0.4 × mastery + 0.2 × latest mock-test score
// coverage = the priority-weighted share of the exam topics learned (a check quiz of 80% or more),
// mastery = the priority-weighted average mastery of the exam topics. No mock test yet counts as
// 0, so the score shows what's still missing. Pure functions, tested on their own.

type TopicLike = Pick<Tables<'topics'>, 'parent_id' | 'track' | 'status' | 'mastery' | 'priority_score'>

export const READINESS_WEIGHTS = { coverage: 0.4, mastery: 0.4, mock: 0.2 } as const

export interface Readiness {
  /** 0–1 */
  score: number
  /** 0–1, priority-weighted share of exam topics learned. */
  coverage: number
  /** 0–1, priority-weighted mastery. */
  mastery: number
  /** The latest mock test's score (0–1); null = none yet (counts as 0). */
  mock: number | null
  examTopics: number
  learnedTopics: number
}

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0)

/** Learned = the topic left the plan after a check quiz of 80% or more (status review or mastered). */
export const isLearned = (topic: Pick<TopicLike, 'status'>) => topic.status === 'review' || topic.status === 'mastered'

/** A subject's readiness from its topics (units are left out) and its latest mock score; null without exam topics. */
export function examReadiness(topics: TopicLike[], latestMock: number | null): Readiness | null {
  const exam = topics.filter((topic) => topic.parent_id !== null && topic.track === 'exam')
  if (exam.length === 0) return null
  const priorities = exam.map((topic) => Math.max(0, Number(topic.priority_score) || 0))
  const total = priorities.reduce((sum, priority) => sum + priority, 0)
  // Without priorities (no exam weights or past papers yet) every topic counts the same.
  const weights = total > 0 ? priorities.map((priority) => priority / total) : exam.map(() => 1 / exam.length)
  let coverage = 0
  let mastery = 0
  exam.forEach((topic, index) => {
    const weight = weights[index] ?? 0
    if (isLearned(topic)) coverage += weight
    mastery += weight * clamp01(Number(topic.mastery))
  })
  const mock = latestMock === null ? null : clamp01(latestMock)
  return {
    score: READINESS_WEIGHTS.coverage * coverage + READINESS_WEIGHTS.mastery * mastery + READINESS_WEIGHTS.mock * (mock ?? 0),
    coverage,
    mastery,
    mock,
    examTopics: exam.length,
    learnedTopics: exam.filter(isLearned).length,
  }
}

/** 0.643 → "64%" */
export const percentText = (share: number) => `${Math.round(clamp01(share) * 100)}%`
