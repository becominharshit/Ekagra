import { LOWER_IS_BETTER, METRICS, type Metric, type MetricValues } from './metrics'

// The weekly challenge (docs/2-technical-design.md §9): one metric at a time, with a target for the
// week. The first target is 5% better than the last measured value. Two weeks on target (at the
// same target) make it 5% harder, or 10% when both weeks beat it by 10% or more; two weeks missed
// make it 5% easier. A week with too little practice to measure counts as missed.
// Pure functions, tested on their own.

export interface ChallengeWeek {
  metric: Metric
  target: number
  /** null until the week is over. */
  achieved: boolean | null
  /** The metric's value that week, when known (for "by 10% or more"). */
  value?: number | null
}

export interface ChallengePlan {
  metric: Metric
  baseline: number | null
  target: number
}

/** Where targets stay: memory at most 90% (more costs too much review time), seconds at least 1. */
const LIMITS: Record<Metric, [min: number, max: number]> = {
  memory: [0.5, 0.9],
  learning_speed: [0.3, 3],
  processing_speed: [1, 600],
  problem_solving: [0.2, 1],
}

export function clampTarget(metric: Metric, target: number): number {
  const [min, max] = LIMITS[metric]
  const clamped = Math.min(max, Math.max(min, target))
  return metric === 'processing_speed' ? Math.round(clamped * 10) / 10 : Math.round(clamped * 1000) / 1000
}

export function isOnTarget(metric: Metric, value: number | null, target: number): boolean {
  if (value === null) return false
  return LOWER_IS_BETTER[metric] ? value <= target + 1e-9 : value >= target - 1e-9
}

/** A new target: 5% better than the baseline. */
export function startTarget(metric: Metric, baseline: number): number {
  return clampTarget(metric, LOWER_IS_BETTER[metric] ? baseline * 0.95 : baseline * 1.05)
}

function beatBy10(metric: Metric, week: ChallengeWeek): boolean {
  if (week.value === null || week.value === undefined) return false
  return LOWER_IS_BETTER[metric] ? week.value <= week.target * 0.9 : week.value >= week.target * 1.1
}

/** The next target for a metric from its finished weeks (oldest first), or null when it has none. */
export function nextTarget(metric: Metric, finished: ChallengeWeek[]): number | null {
  const own = finished.filter((week) => week.metric === metric && week.achieved !== null)
  const last = own[own.length - 1]
  if (!last) return null
  const before = own[own.length - 2]
  let factor = 1
  // Two weeks in a row at the same target decide; one week alone changes nothing.
  if (before && Math.abs(before.target - last.target) < 1e-9) {
    if (before.achieved && last.achieved) factor = beatBy10(metric, before) && beatBy10(metric, last) ? 1.1 : 1.05
    else if (!before.achieved && !last.achieved) factor = 0.95
  }
  // For processing speed harder means fewer seconds.
  return clampTarget(metric, last.target * (LOWER_IS_BETTER[metric] ? 2 - factor : factor))
}

/**
 * This week's challenge: the metric of the last one, with its target adapted; for a first
 * challenge, the first metric measured last time. Null while nothing could be measured.
 */
export function planChallenge(finished: ChallengeWeek[], latest: MetricValues | null): ChallengePlan | null {
  const last = finished[finished.length - 1]
  if (last) return { metric: last.metric, baseline: latest?.[last.metric] ?? null, target: nextTarget(last.metric, finished) ?? last.target }
  const metric = latest ? METRICS.find((one) => latest[one] !== null) : undefined
  const baseline = metric && latest ? latest[metric] : null
  return metric && baseline !== null ? { metric, baseline, target: startTarget(metric, baseline) } : null
}

const percent = (share: number) => `${Math.round(share * 100)}%`

/** The week's goal in words. */
export function challengeGoal(metric: Metric, target: number): string {
  if (metric === 'memory') return `remember ${percent(target)} or more of what you review`
  if (metric === 'learning_speed') return `learn topics ${target.toFixed(1)}× as fast as planned, or faster`
  if (metric === 'processing_speed') return `answer right in ${Number.isInteger(target) ? target : target.toFixed(1)} seconds or less (median)`
  return `get ${percent(target)} of new hard questions right on the first try`
}

export const CHALLENGE_TIP: Record<Metric, string> = {
  memory: 'Do your flashcard reviews every day and come back to your mistakes.',
  learning_speed: 'Study topics in their planned blocks, with a focus session.',
  processing_speed: 'Practise questions: quick right answers bring it down.',
  problem_solving: 'Try new practice questions before you look at the answer.',
}
