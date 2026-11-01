import { format } from 'date-fns'
import { isNew, type Flashcard } from '@/features/flashcards/fsrs'
import type { Mistake } from '@/features/mistakes/ladder'
import { addDays } from './time'
import type { LocalDate } from './types'

// How much review time each day needs, for the plan's review block: flashcards due that day
// (plus new cards at the daily limit) and open mistakes due that day. Overdue ones count today.

/** About 12 seconds per flashcard. A mistake takes longer: you re-read why it went wrong. */
const SECONDS_PER_CARD = 12
const SECONDS_PER_MISTAKE = 45

export interface ReviewLoadInput {
  cards: Flashcard[]
  mistakes: Mistake[]
  today: LocalDate
  days: number
  newCardsPerDay: number
  /** The local date of a timestamp (tests pass their own). */
  localDate?: (iso: string) => LocalDate
}

/** Review minutes per day, rounded up to 5 minutes like the plan's other blocks. */
export function reviewMinutesByDay({
  cards,
  mistakes,
  today,
  days,
  newCardsPerDay,
  localDate = (iso) => format(new Date(iso), 'yyyy-MM-dd'),
}: ReviewLoadInput): Record<LocalDate, number> {
  const seconds = new Map<LocalDate, number>()
  const add = (iso: string, amount: number) => {
    const day = localDate(iso)
    const key = day < today ? today : day
    seconds.set(key, (seconds.get(key) ?? 0) + amount)
  }
  const active = cards.filter((card) => !card.suspended)
  for (const card of active) if (!isNew(card)) add(card.due_at, SECONDS_PER_CARD)
  for (const mistake of mistakes) if (mistake.status === 'open') add(mistake.next_review_at, SECONDS_PER_MISTAKE)

  let newLeft = active.filter((card) => isNew(card)).length
  const minutes: Record<LocalDate, number> = {}
  for (let index = 0; index < days; index++) {
    const date = addDays(today, index)
    const fresh = Math.min(newCardsPerDay, newLeft)
    newLeft -= fresh
    const total = (seconds.get(date) ?? 0) + fresh * SECONDS_PER_CARD
    if (total > 0) minutes[date] = Math.ceil(total / 60 / 5) * 5
  }
  return minutes
}
