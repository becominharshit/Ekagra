import { intervalLabel } from '@/features/flashcards/fsrs'
import type { LocalDate } from '@/features/planner/types'
import type { Tables, TablesUpdate } from '@/types/database'

// The mistake notebook's review ladder. Plain functions, tested on their own.
//   - A new mistake comes back after 1 day.
//   - Each right answer moves it up the ladder: next time after 3 days, then after 7.
//   - A wrong answer sends it back to 1 day, and the right answers are counted again from zero.
//   - It is fixed after 2 right answers on different days (2 on one day count once).

export type Mistake = Tables<'mistakes'>

/** Days until the next review, for each ladder_step (0, 1, 2). */
export const LADDER_DAYS = [1, 3, 7] as const
/** Right answers on different days (since the last wrong one) that fix a mistake. */
export const RIGHT_ANSWERS_TO_FIX = 2

const DAY_MS = 24 * 60 * 60 * 1000

function daysLater(now: Date, step: number): string {
  const days = LADDER_DAYS[Math.min(Math.max(0, step), LADDER_DAYS.length - 1)] ?? 1
  return new Date(now.getTime() + days * DAY_MS).toISOString()
}

/** When a new mistake comes back first: 1 day later (the same as the database default). */
export function firstReviewAt(now: Date): string {
  return daysLater(now, 0)
}

/** The changes to save after a review. An empty object means nothing changes. */
export function reviewMistake(
  mistake: Pick<Mistake, 'ladder_step' | 'correct_count' | 'last_correct_on'>,
  right: boolean,
  now: Date,
  today: LocalDate,
): TablesUpdate<'mistakes'> {
  if (!right) return { status: 'open', ladder_step: 0, correct_count: 0, next_review_at: daysLater(now, 0) }
  if (mistake.last_correct_on === today) return {}
  const count = mistake.correct_count + 1
  if (count >= RIGHT_ANSWERS_TO_FIX) return { status: 'fixed', correct_count: count, last_correct_on: today }
  const step = Math.min(mistake.ladder_step + 1, LADDER_DAYS.length - 1)
  return { ladder_step: step, correct_count: count, last_correct_on: today, next_review_at: daysLater(now, step) }
}

/** Puts a fixed mistake back on the ladder from the start. */
export function reopenMistake(now: Date): TablesUpdate<'mistakes'> {
  return { status: 'open', ladder_step: 0, correct_count: 0, last_correct_on: null, next_review_at: daysLater(now, 0) }
}

/** Open mistakes due by the end of today, the longest-waiting first. */
export function dueMistakes(mistakes: Mistake[], endOfToday: Date): Mistake[] {
  return mistakes
    .filter((mistake) => mistake.status === 'open' && Date.parse(mistake.next_review_at) <= endOfToday.getTime())
    .sort((a, b) => Date.parse(a.next_review_at) - Date.parse(b.next_review_at))
}

/** "Fixed", "Due now" or "Due in 3 d". */
export function mistakeLabel(mistake: Pick<Mistake, 'status' | 'next_review_at'>, now: Date, endOfToday: Date): string {
  if (mistake.status === 'fixed') return 'Fixed'
  const due = Date.parse(mistake.next_review_at)
  return due <= endOfToday.getTime() ? 'Due now' : `Due in ${intervalLabel(due - now.getTime())}`
}
