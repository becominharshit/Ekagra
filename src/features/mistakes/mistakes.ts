import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { academicsKey } from '@/features/academics/subjects'
import type { Grade } from '@/features/flashcards/fsrs'
import { getScheduler } from '@/features/flashcards/scheduler'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { dateKeyInTimezone } from '@/lib/timezone'
import type { TablesInsert, TablesUpdate } from '@/types/database'
import { firstReviewAt, reopenMistake, reviewMistake, type Mistake } from './ladder'

// The mistake notebook, saved in Supabase or (Demo Mode) on the device.

const newestFirst = (a: Mistake, b: Mistake) => Date.parse(b.created_at) - Date.parse(a.created_at)

export async function listMistakes(source: DataSource): Promise<Mistake[]> {
  if (source.kind === 'demo') return demoDb.list('mistakes').sort(newestFirst)
  const { data, error } = await source.client
    .from('mistakes')
    .select('*')
    .eq('user_id', source.userId)
    .order('created_at', { ascending: false })
  if (error) throw dbError(error)
  return data
}

/** Adds a mistake. It comes back for its first review 1 day later. */
export async function addMistake(source: DataSource, values: TablesInsert<'mistakes'>, now = new Date()): Promise<void> {
  const row = { fsrs: {}, next_review_at: firstReviewAt(now), ...values }
  if (source.kind === 'demo') {
    demoDb.insert('mistakes', [row])
    return
  }
  const { error } = await source.client.from('mistakes').insert(row)
  if (error) throw dbError(error)
}

export async function updateMistake(source: DataSource, { id, patch }: { id: string; patch: TablesUpdate<'mistakes'> }): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.update('mistakes', id, patch)
    return
  }
  const { error } = await source.client.from('mistakes').update(patch).eq('id', id)
  if (error) throw dbError(error)
}

export async function deleteMistake(source: DataSource, id: string): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.remove('mistakes', [id])
    return
  }
  const { error } = await source.client.from('mistakes').delete().eq('id', id)
  if (error) throw dbError(error)
}

/** Saves an adaptive ts-fsrs review for a mistake (`grade` 1..4, or boolean `right`). */
export async function recordMistakeReview(
  source: DataSource,
  {
    mistake,
    right,
    grade,
    now = new Date(),
    timeZone,
  }: { mistake: Mistake; right?: boolean; grade?: Grade; now?: Date; timeZone?: string },
): Promise<void> {
  const scheduler = await getScheduler(0.9, false)
  const today = timeZone ? dateKeyInTimezone(now, timeZone) : format(now, 'yyyy-MM-dd')
  const patch = reviewMistake(mistake, grade ?? right ?? false, now, today, scheduler)
  if (Object.keys(patch).length > 0) await updateMistake(source, { id: mistake.id, patch })
}

export async function reopen(source: DataSource, mistake: Mistake): Promise<void> {
  await updateMistake(source, { id: mistake.id, patch: reopenMistake(new Date()) })
}

/** The open mistake about the same flashcard or question, if there is one. */
async function findOpen(source: DataSource, link: { flashcard_id?: string | null; question_id?: string | null }): Promise<Mistake | null> {
  const column = link.flashcard_id ? 'flashcard_id' : link.question_id ? 'question_id' : null
  const id = link.flashcard_id ?? link.question_id
  if (!column || !id) return null
  if (source.kind === 'demo') {
    return demoDb.list('mistakes').find((mistake) => mistake.status === 'open' && mistake[column] === id) ?? null
  }
  const { data, error } = await source.client
    .from('mistakes')
    .select('*')
    .eq('user_id', source.userId)
    .eq(column, id)
    .eq('status', 'open')
    .limit(1)
  if (error) throw dbError(error)
  return data[0] ?? null
}

/**
 * Notes a mistake about a flashcard or question (a forgotten card, a wrong quiz answer). If that
 * card or question already has an open mistake, it isn't added twice: FSRS logs Again (`1`) on it.
 */
export async function noteMistake(source: DataSource, values: TablesInsert<'mistakes'>, now = new Date()): Promise<void> {
  const open = await findOpen(source, values)
  if (open) await recordMistakeReview(source, { mistake: open, grade: 1, now })
  else await addMistake(source, values, now)
}

/** Makes a flashcard from a mistake (front: the concept, back: the correct approach) and links them. */
export async function makeCardFromMistake(source: DataSource, mistake: Mistake): Promise<void> {
  const back = mistake.correct_approach?.trim()
  if (!back) throw new Error('Write the correct approach first: it becomes the back of the card.')
  const card: TablesInsert<'flashcards'> = { id: crypto.randomUUID(), front: mistake.concept, back, topic_id: mistake.topic_id, source: 'mistake' }
  if (source.kind === 'demo') demoDb.insert('flashcards', [card])
  else {
    const { error } = await source.client.from('flashcards').insert(card)
    if (error) throw dbError(error)
  }
  await updateMistake(source, { id: mistake.id, patch: { flashcard_id: card.id } })
}

export function useMistakes() {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'mistakes'],
    queryFn: () => listMistakes(need(source)),
    enabled: source !== null,
  })
}
