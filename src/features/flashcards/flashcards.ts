import { useQuery } from '@tanstack/react-query'
import { endOfDay, startOfDay } from 'date-fns'
import { academicsKey } from '@/features/academics/subjects'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'
import { noteMistake } from '@/features/mistakes/mistakes'
import { CARD_STATE, isLapse, reviewCard, reviewQueue, type Flashcard, type Grade, type Scheduler } from './fsrs'

// Flashcards and their reviews, saved in Supabase or (Demo Mode) on the device.

export type FlashcardReview = Tables<'flashcard_reviews'>

const newestFirst = (a: Flashcard, b: Flashcard) => Date.parse(b.created_at) - Date.parse(a.created_at)

export async function listCards(source: DataSource): Promise<Flashcard[]> {
  if (source.kind === 'demo') return demoDb.list('flashcards').sort(newestFirst)
  const { data, error } = await source.client
    .from('flashcards')
    .select('*')
    .eq('user_id', source.userId)
    .order('created_at', { ascending: false })
  if (error) throw dbError(error)
  return data
}

export async function listReviewsSince(source: DataSource, since: Date): Promise<FlashcardReview[]> {
  if (source.kind === 'demo') return demoDb.list('flashcard_reviews').filter((review) => Date.parse(review.reviewed_at) >= since.getTime())
  const { data, error } = await source.client
    .from('flashcard_reviews')
    .select('*')
    .eq('user_id', source.userId)
    .gte('reviewed_at', since.toISOString())
  if (error) throw dbError(error)
  return data
}

/** How many new cards were started today (the daily limit counts these). */
export function newCardsStarted(reviews: FlashcardReview[]): number {
  const started = new Set<string>()
  for (const review of reviews) {
    const log = review.log as { state?: unknown } | null
    if (log && log.state === CARD_STATE.new) started.add(review.flashcard_id)
  }
  return started.size
}

/** Today's review session (see reviewQueue), with the new cards already started today counted. */
export function todaysQueue(cards: Flashcard[], reviewsToday: FlashcardReview[], newPerDay: number, now: Date): Flashcard[] {
  const newLeft = Math.max(0, newPerDay - newCardsStarted(reviewsToday))
  return reviewQueue(cards, now, newLeft, endOfDay(now))
}

export async function addCards(source: DataSource, cards: TablesInsert<'flashcards'>[]): Promise<void> {
  if (cards.length === 0) return
  if (source.kind === 'demo') {
    demoDb.insert('flashcards', cards)
    return
  }
  const { error } = await source.client.from('flashcards').insert(cards)
  if (error) throw dbError(error)
}

export async function updateCard(source: DataSource, { id, patch }: { id: string; patch: TablesUpdate<'flashcards'> }): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.update('flashcards', id, patch)
    return
  }
  const { error } = await source.client.from('flashcards').update(patch).eq('id', id)
  if (error) throw dbError(error)
}

export async function deleteCard(source: DataSource, id: string): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.remove('flashcards', [id])
    return
  }
  const { error } = await source.client.from('flashcards').delete().eq('id', id)
  if (error) throw dbError(error)
}

export interface Review {
  card: Flashcard
  grade: Grade
  /** How long the student looked at the card before answering. */
  durationMs: number
  scheduler: Scheduler
  now?: Date
}

/**
 * Saves one review: the card's new FSRS state and due date, and a row in flashcard_reviews.
 * A forgotten card (a lapse) also goes to the mistake notebook.
 */
export async function recordReview(source: DataSource, review: Review): Promise<void> {
  const now = review.now ?? new Date()
  await saveReview(source, { ...review, now })
  const { card, grade } = review
  if (!isLapse(card, grade)) return
  try {
    await noteMistake(source, { concept: card.front, correct_approach: card.back, topic_id: card.topic_id, flashcard_id: card.id }, now)
  } catch (error) {
    // The review itself is saved; a missing notebook entry must not undo it or block the session.
    console.error('Could not add the forgotten card to the mistake notebook:', error)
  }
}

async function saveReview(source: DataSource, { card, grade, durationMs, scheduler, now = new Date() }: Review): Promise<void> {
  const outcome = reviewCard(scheduler, card.fsrs, grade, now)
  const review = {
    flashcard_id: card.id,
    rating: grade,
    reviewed_at: outcome.reviewedAt,
    duration_ms: Math.max(0, Math.round(durationMs)),
    log: outcome.log,
  }
  if (source.kind === 'demo') {
    demoDb.update('flashcards', card.id, { fsrs: outcome.fsrs, due_at: outcome.dueAt })
    demoDb.insert('flashcard_reviews', [review])
    return
  }
  const updated = await source.client.from('flashcards').update({ fsrs: outcome.fsrs, due_at: outcome.dueAt }).eq('id', card.id)
  if (updated.error) throw dbError(updated.error)
  const { error } = await source.client.from('flashcard_reviews').insert(review)
  if (error) throw dbError(error)
}

export function useFlashcards() {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'flashcards'],
    queryFn: () => listCards(need(source)),
    enabled: source !== null,
  })
}

/** Reviews since local midnight (for the daily new-card limit). `now` comes from useNow, so it rolls over at midnight. */
export function useReviewsToday(now: Date) {
  const { source, owner } = useDataSource()
  const since = startOfDay(now)
  return useQuery({
    queryKey: [...academicsKey(owner), 'reviews', since.toISOString()],
    queryFn: () => listReviewsSince(need(source), since),
    enabled: source !== null,
  })
}

/** The FSRS scheduler for a target retention. Its library is downloaded the first time it's needed. */
export function useScheduler(retention: number) {
  return useQuery({
    queryKey: ['fsrs-scheduler', retention],
    queryFn: async () => (await import('./scheduler')).getScheduler(retention),
    staleTime: Number.POSITIVE_INFINITY,
  })
}
