import { addDays, format, startOfWeek } from 'date-fns'

// The 4 learning metrics of a week (docs/2-technical-design.md §9), worked out from what the
// student did. Pure functions, tested on their own.
//   Memory           share of flashcard reviews rated Good/Easy, plus questions answered right
//                    again after 7 days or more                                  (aim: 85–90%)
//   Learning speed   estimated ÷ actual minutes for the topics learned that week  (1.0 = as planned)
//   Processing speed median seconds per right answer                             (lower is better)
//   Problem solving  first-try accuracy on new questions of difficulty 3+, weighted by difficulty
// A metric with too little behind it is null ("not enough practice to say").

export const METRICS = ['memory', 'learning_speed', 'processing_speed', 'problem_solving'] as const
export type Metric = (typeof METRICS)[number]

export const METRIC_LABEL: Record<Metric, string> = {
  memory: 'Memory',
  learning_speed: 'Learning speed',
  processing_speed: 'Processing speed',
  problem_solving: 'Problem solving',
}

/** Only processing speed (seconds per answer) is better when it goes down. */
export const LOWER_IS_BETTER: Record<Metric, boolean> = { memory: false, learning_speed: false, processing_speed: true, problem_solving: false }

/** Fewer answers than this say nothing yet. */
const MIN_MEMORY = 5
const MIN_TIMED = 5
const MIN_FIRST_TRIES = 3
const DAY_MS = 24 * 60 * 60 * 1000
const RETEST_GAP_MS = 7 * DAY_MS

export interface MetricInputs {
  reviews: { rating: number; reviewed_at: string }[]
  attempts: { question_id: string; is_correct: boolean | null; time_ms: number | null; created_at: string }[]
  /** Difficulty (1–5) of the questions answered. */
  questionDifficulty: ReadonlyMap<string, number | null>
  topics: { id: string; est_minutes: number | null; learned_at: string | null }[]
  /** Minutes studied per topic and day (plan blocks done or partly done). */
  topicMinutes: { topic_id: string; minutes: number; date: string }[]
  focus: { started_at: string; actual_minutes: number | null }[]
}

export interface WeekMetrics {
  /** The Monday the week began, 'YYYY-MM-DD'. */
  weekStart: string
  memory: number | null
  learningSpeed: number | null
  /** Seconds per right answer. */
  processingSpeed: number | null
  problemSolving: number | null
  focusMinutes: number
  details: { reviews: number; retests: number; timedAnswers: number; firstTries: number; learnedTopics: number }
}

/** Weeks start on Monday. */
export function weekStartOf(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 })
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? (sorted[middle] ?? null) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places

export function weekMetrics(inputs: MetricInputs, weekStart: Date): WeekMetrics {
  const from = weekStart.getTime()
  const to = addDays(weekStart, 7).getTime()
  const inWeek = (iso: string) => {
    const at = Date.parse(iso)
    return at >= from && at < to
  }

  const reviews = inputs.reviews.filter((review) => inWeek(review.reviewed_at))
  const goodReviews = reviews.filter((review) => review.rating >= 3).length

  // Every question's answers in time order: the first one is the first try; a later one after a gap is a re-test.
  const byQuestion = new Map<string, MetricInputs['attempts']>()
  for (const attempt of inputs.attempts) {
    const list = byQuestion.get(attempt.question_id) ?? []
    list.push(attempt)
    byQuestion.set(attempt.question_id, list)
  }
  let retests = 0
  let rightRetests = 0
  let firstTries = 0
  let firstTryWeight = 0
  let firstTryRightWeight = 0
  const rightSeconds: number[] = []
  for (const [questionId, list] of byQuestion) {
    list.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    list.forEach((attempt, index) => {
      if (!inWeek(attempt.created_at)) return
      const previous = index > 0 ? list[index - 1] : undefined
      if (previous && Date.parse(attempt.created_at) - Date.parse(previous.created_at) >= RETEST_GAP_MS) {
        retests += 1
        if (attempt.is_correct) rightRetests += 1
      }
      if (attempt.is_correct && attempt.time_ms !== null && attempt.time_ms > 0) rightSeconds.push(attempt.time_ms / 1000)
      const difficulty = inputs.questionDifficulty.get(questionId) ?? null
      if (index === 0 && difficulty !== null && difficulty >= 3) {
        firstTries += 1
        firstTryWeight += difficulty
        if (attempt.is_correct) firstTryRightWeight += difficulty
      }
    })
  }

  let estimated = 0
  let actual = 0
  let learnedTopics = 0
  for (const topic of inputs.topics) {
    if (!topic.learned_at || !inWeek(topic.learned_at) || !topic.est_minutes || topic.est_minutes <= 0) continue
    // Plan blocks are dated in local time, so the day it was learned is too.
    const learnedOn = format(new Date(topic.learned_at), 'yyyy-MM-dd')
    const minutes = inputs.topicMinutes.filter((row) => row.topic_id === topic.id && row.date <= learnedOn).reduce((sum, row) => sum + row.minutes, 0)
    if (minutes <= 0) continue
    estimated += topic.est_minutes
    actual += minutes
    learnedTopics += 1
  }

  const memoryCount = reviews.length + retests
  const processing = rightSeconds.length >= MIN_TIMED ? median(rightSeconds) : null
  return {
    weekStart: format(weekStart, 'yyyy-MM-dd'),
    memory: memoryCount >= MIN_MEMORY ? round((goodReviews + rightRetests) / memoryCount, 4) : null,
    learningSpeed: learnedTopics > 0 ? round(Math.min(999, estimated / actual), 3) : null,
    processingSpeed: processing === null ? null : Math.max(0.1, round(processing, 1)),
    problemSolving: firstTries >= MIN_FIRST_TRIES ? round(firstTryRightWeight / firstTryWeight, 4) : null,
    focusMinutes: inputs.focus.filter((session) => inWeek(session.started_at)).reduce((sum, session) => sum + (session.actual_minutes ?? 0), 0),
    details: { reviews: reviews.length, retests, timedAnswers: rightSeconds.length, firstTries, learnedTopics },
  }
}

/** Did anything happen that week? (Empty weeks aren't saved.) */
export function hasActivity(metrics: WeekMetrics): boolean {
  const { reviews, retests, timedAnswers, firstTries, learnedTopics } = metrics.details
  return metrics.focusMinutes > 0 || reviews + retests + timedAnswers + firstTries + learnedTopics > 0
}

/** A metric's value in words, e.g. "86%", "1.2× the plan", "14 s". */
export function metricValueLabel(metric: Metric, value: number | null): string {
  if (value === null) return '–'
  if (metric === 'learning_speed') return `${value.toFixed(value >= 10 ? 0 : 1)}× the plan`
  if (metric === 'processing_speed') return `${Math.round(value)} s`
  return `${Math.round(value * 100)}%`
}
