import {
  CARD_STATE,
  GRADES,
  GRADE_LABEL,
  intervalLabel,
  previewIntervals,
  reviewCard,
  type Grade,
  type Scheduler,
} from '@/features/flashcards/fsrs'
import type { LocalDate } from '@/features/planner/types'
import type { Json, Tables, TablesUpdate } from '@/types/database'

// Mistake notebook spaced repetition powered by ts-fsrs (matching flashcards/fsrs.ts).
// Each mistake carries FSRS stability, difficulty, state, and lapses in `mistakes.fsrs`,
// schedules adaptive intervals via Again/Hard/Good/Easy, and fixes after repeated recalls.

export type Mistake = Tables<'mistakes'>
export type MistakeGrade = Grade
export { GRADES, GRADE_LABEL }

/** Recall successes across distinct calendar days needed to mark an open mistake fixed. */
export const RIGHT_ANSWERS_TO_FIX = 3

const DAY_MS = 24 * 60 * 60 * 1000

/** Initial review timestamp for a brand-new mistake (matches the DB default: 1 day later). */
export function firstReviewAt(now: Date): string {
  return new Date(now.getTime() + DAY_MS).toISOString()
}

export function mistakeFsrsStats(fsrs: Json): { state: number; lapses: number; stability: number; difficulty: number } {
  if (typeof fsrs !== 'object' || fsrs === null || Array.isArray(fsrs)) {
    return { state: CARD_STATE.new, lapses: 0, stability: 0, difficulty: 0 }
  }
  const raw = fsrs as Record<string, unknown>
  return {
    state: typeof raw.state === 'number' ? raw.state : CARD_STATE.new,
    lapses: typeof raw.lapses === 'number' ? raw.lapses : 0,
    stability: typeof raw.stability === 'number' ? raw.stability : 0,
    difficulty: typeof raw.difficulty === 'number' ? raw.difficulty : 0,
  }
}

/** Priority weight for weak / overdue / frequently lapsed mistakes (higher = more urgent). */
export function mistakeWeaknessScore(
  mistake: Pick<Mistake, 'status' | 'fsrs' | 'next_review_at' | 'correct_count'>,
  now: Date,
): number {
  if (mistake.status === 'fixed') return 0
  const stats = mistakeFsrsStats(mistake.fsrs)
  const overdueHours = Math.max(0, (now.getTime() - Date.parse(mistake.next_review_at)) / 3_600_000)
  const lowStability = Math.max(0, 12 - Math.min(12, stats.stability)) * 2
  const unlearnedBoost = mistake.correct_count === 0 ? 15 : 0
  return overdueHours + stats.lapses * 48 + lowStability + unlearnedBoost
}

/**
 * Computes the adaptive ts-fsrs patch after reviewing a mistake.
 * Accepts either a boolean (`false` = Again, `true` = Good) or an explicit FSRS `Grade` (1..4).
 */
export function reviewMistake(
  mistake: Pick<Mistake, 'fsrs' | 'ladder_step' | 'correct_count' | 'last_correct_on'>,
  gradeOrRight: boolean | Grade,
  now: Date,
  today: LocalDate,
  scheduler: Scheduler,
): TablesUpdate<'mistakes'> {
  const grade: Grade = typeof gradeOrRight === 'boolean' ? (gradeOrRight ? 3 : 1) : gradeOrRight
  const outcome = reviewCard(scheduler, mistake.fsrs, grade, now)

  if (grade === 1) {
    return {
      status: 'open',
      ladder_step: 0,
      correct_count: 0,
      fsrs: outcome.fsrs,
      next_review_at: outcome.dueAt,
    }
  }

  const count = mistake.last_correct_on === today ? mistake.correct_count : mistake.correct_count + 1
  const step = Math.min(2, count)
  const fixed = count >= RIGHT_ANSWERS_TO_FIX && grade >= 3

  return {
    status: fixed ? 'fixed' : 'open',
    ladder_step: step,
    correct_count: count,
    last_correct_on: today,
    fsrs: outcome.fsrs,
    next_review_at: outcome.dueAt,
  }
}

/** Next-review intervals (ms) for Again / Hard / Good / Easy using ts-fsrs. */
export function previewMistakeIntervals(
  mistake: Pick<Mistake, 'fsrs'>,
  now: Date,
  scheduler: Scheduler,
): Record<Grade, number> {
  return previewIntervals(scheduler, mistake.fsrs, now)
}

/** Reopens a fixed mistake and resets its FSRS state. */
export function reopenMistake(now: Date): TablesUpdate<'mistakes'> {
  return {
    status: 'open',
    ladder_step: 0,
    correct_count: 0,
    last_correct_on: null,
    fsrs: {},
    next_review_at: firstReviewAt(now),
  }
}

/**
 * Open mistakes due for review:
 * - Learning/relearning steps are due once `next_review_at <= now` (defaulting `now = endOfToday`).
 * - New/review cards are due when `next_review_at <= endOfToday`.
 * Ordered by most overdue first, then highest weakness score.
 */
export function dueMistakes(mistakes: Mistake[], endOfToday: Date, now: Date = endOfToday): Mistake[] {
  return mistakes
    .filter((mistake) => {
      if (mistake.status !== 'open') return false
      const dueMs = Date.parse(mistake.next_review_at)
      const { state } = mistakeFsrsStats(mistake.fsrs)
      const isShortTerm = state === CARD_STATE.learning || state === CARD_STATE.relearning
      return isShortTerm ? dueMs <= now.getTime() : dueMs <= endOfToday.getTime()
    })
    .sort((a, b) => {
      const dueDiff = Date.parse(a.next_review_at) - Date.parse(b.next_review_at)
      if (dueDiff !== 0) return dueDiff
      return mistakeWeaknessScore(b, now) - mistakeWeaknessScore(a, now)
    })
}

/** "Fixed", "Due now", or "Due in 3 d". */
export function mistakeLabel(
  mistake: Pick<Mistake, 'status' | 'fsrs' | 'next_review_at'>,
  now: Date,
  endOfToday: Date,
): string {
  if (mistake.status === 'fixed') return 'Fixed'
  const due = Date.parse(mistake.next_review_at)
  const { state } = mistakeFsrsStats(mistake.fsrs)
  const isShortTerm = state === CARD_STATE.learning || state === CARD_STATE.relearning
  const threshold = isShortTerm ? now.getTime() : endOfToday.getTime()
  return due <= threshold ? 'Due now' : `Due in ${intervalLabel(Math.max(60_000, due - now.getTime()))}`
}
