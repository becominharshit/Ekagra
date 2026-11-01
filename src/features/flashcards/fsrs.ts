import { format } from 'date-fns'
import type { DefaultScheduler } from 'ts-fsrs'
import { addDays } from '@/features/planner/time'
import type { LocalDate } from '@/features/planner/types'
import type { Json, Tables } from '@/types/database'

// Spaced repetition with FSRS (the ts-fsrs library): every review moves a card's next due date so
// it comes back just before you would forget it. Plain functions around the library, tested.
// The scheduler itself is made in scheduler.ts, which the app only loads for reviews.

export type Flashcard = Tables<'flashcards'>

/** flashcard_reviews.rating: 1 Again, 2 Hard, 3 Good, 4 Easy. */
export type Grade = 1 | 2 | 3 | 4
export const GRADES: readonly Grade[] = [1, 2, 3, 4]
export const GRADE_LABEL: Record<Grade, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' }

/** The card states FSRS uses (saved inside flashcards.fsrs). */
export const CARD_STATE = { new: 0, learning: 1, review: 2, relearning: 3 } as const

/** An FSRS scheduler (made by getScheduler in scheduler.ts). */
export type Scheduler = DefaultScheduler
type SchedulerCard = ReturnType<Scheduler['newCard']>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** The saved state (JSON, dates as text) → the scheduler's card. Nothing (or nothing usable) saved → a new card. */
export function cardFromJson(scheduler: Scheduler, saved: Json, now: Date): SchedulerCard {
  const dueAt = isRecord(saved) ? validDate(saved.dueAt) : null
  if (!isRecord(saved) || !dueAt || typeof saved.state !== 'number') return scheduler.newCard({ now })
  return { ...saved, dueAt, lastReviewAt: validDate(saved.lastReviewAt) } as unknown as SchedulerCard
}

/**
 * When a review counts as happening: now, but never before the card's last review. The screen's
 * clock can lag a few seconds behind the last save, a phone's clock can be set back, and another
 * device's clock can be ahead; FSRS can't work with negative time.
 */
function reviewTime(card: SchedulerCard, now: Date): Date {
  const last = card.lastReviewAt?.getTime()
  return last !== undefined && last > now.getTime() ? new Date(last) : now
}

/** Anything from the scheduler → plain JSON for the database (dates become ISO text). */
function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json
}

export function isNew(card: Pick<Flashcard, 'fsrs'>): boolean {
  return !isRecord(card.fsrs) || card.fsrs.state === undefined || card.fsrs.state === CARD_STATE.new
}

function stateOf(card: Pick<Flashcard, 'fsrs'>): number {
  return isRecord(card.fsrs) && typeof card.fsrs.state === 'number' ? card.fsrs.state : CARD_STATE.new
}

export interface ReviewOutcome {
  /** New flashcards.fsrs */
  fsrs: Json
  /** New flashcards.due_at */
  dueAt: string
  /** For flashcard_reviews.reviewed_at (now, or the last review if the clock is behind it). */
  reviewedAt: string
  /** For flashcard_reviews.log (it includes the state before the review). */
  log: Json
}

export function reviewCard(scheduler: Scheduler, saved: Json, grade: Grade, now: Date): ReviewOutcome {
  const card = cardFromJson(scheduler, saved, now)
  const at = reviewTime(card, now)
  const result = scheduler.review({ card, grade, now: at })
  return { fsrs: toJson(result.card), dueAt: result.card.dueAt.toISOString(), reviewedAt: at.toISOString(), log: toJson(result.revlog) }
}

/** How long until the card comes back, for each grade (milliseconds). */
export function previewIntervals(scheduler: Scheduler, saved: Json, now: Date): Record<Grade, number> {
  const card = cardFromJson(scheduler, saved, now)
  const at = reviewTime(card, now)
  const result = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<Grade, number>
  for (const grade of GRADES) result[grade] = scheduler.review({ card, grade, now: at }).card.dueAt.getTime() - at.getTime()
  return result
}

/** 60,000 → "1 min", 14 hours → "14 h", 5 days → "5 d", 70 days → "2 mo". */
export function intervalLabel(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h`
  const days = Math.round(hours / 24)
  if (days < 60) return `${days} d`
  const months = Math.round(days / 30)
  return months < 12 ? `${months} mo` : `${Math.round((days / 365) * 10) / 10} y`
}

/** A card's status in words: "Suspended", "New", "Due now" or "Due in 4 d". */
export function dueLabel(card: Pick<Flashcard, 'fsrs' | 'due_at' | 'suspended'>, now: Date): string {
  if (card.suspended) return 'Suspended'
  if (isNew(card)) return 'New'
  const wait = Date.parse(card.due_at) - now.getTime()
  return wait <= 0 ? 'Due now' : `Due in ${intervalLabel(wait)}`
}

/** Learning cards due within this time are shown in the same session (like Anki's "learn ahead"). */
const LEARN_AHEAD_MS = 20 * 60_000

/**
 * Today's session, in order: learning cards that are due now, reviews due today (oldest first),
 * new cards up to today's limit, and last the learning cards due within 20 minutes (so a card
 * you just learned doesn't come straight back). Suspended cards never come up.
 */
export function reviewQueue(cards: Flashcard[], now: Date, newLeftToday: number, endOfToday: Date): Flashcard[] {
  const active = cards.filter((card) => !card.suspended)
  const due = (card: Flashcard) => Date.parse(card.due_at)
  const byDue = (a: Flashcard, b: Flashcard) => due(a) - due(b)
  const learning = active.filter((card) => {
    const state = stateOf(card)
    return state === CARD_STATE.learning || state === CARD_STATE.relearning
  })
  const reviews = active.filter((card) => stateOf(card) === CARD_STATE.review && due(card) <= endOfToday.getTime())
  const fresh = active
    .filter((card) => isNew(card))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    .slice(0, Math.max(0, newLeftToday))
  const learningNow = learning.filter((card) => due(card) <= now.getTime()).sort(byDue)
  const learningSoon = learning
    .filter((card) => due(card) > now.getTime() && due(card) <= now.getTime() + LEARN_AHEAD_MS)
    .sort(byDue)
  return [...learningNow, ...reviews.sort(byDue), ...fresh, ...learningSoon]
}

/** About 12 seconds per card. */
const SECONDS_PER_CARD = 12

/**
 * Review minutes per day for the planner: cards due that day (today also gets overdue ones),
 * and new cards spread over the days at the daily limit. Rounded up to 5 minutes, like the
 * plan's other blocks.
 */
export function reviewMinutesByDay(
  cards: Flashcard[],
  today: LocalDate,
  days: number,
  newPerDay: number,
  localDate: (iso: string) => LocalDate = (iso) => format(new Date(iso), 'yyyy-MM-dd'),
): Record<LocalDate, number> {
  const active = cards.filter((card) => !card.suspended)
  let newLeft = active.filter((card) => isNew(card)).length
  const counts = new Map<LocalDate, number>()
  for (const card of active) {
    if (isNew(card)) continue
    const day = localDate(card.due_at)
    const key = day < today ? today : day
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const minutes: Record<LocalDate, number> = {}
  for (let index = 0; index < days; index++) {
    const date = addDays(today, index)
    const fresh = Math.min(newPerDay, newLeft)
    newLeft -= fresh
    const total = (counts.get(date) ?? 0) + fresh
    if (total > 0) minutes[date] = Math.ceil((total * SECONDS_PER_CARD) / 60 / 5) * 5
  }
  return minutes
}
