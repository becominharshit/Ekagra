import { describe, expect, it } from 'vitest'
import { addCards, listCards, recordReview } from '@/features/flashcards/flashcards'
import { reviewCard } from '@/features/flashcards/fsrs'
import { getScheduler } from '@/features/flashcards/scheduler'
import type { DataSource } from '@/lib/dataSource'
import { stubLocalStorage } from '@/test/memoryStorage'
import { mistakeFsrsStats, type Mistake } from './ladder'
import { addMistake, listMistakes, makeCardFromMistake, noteMistake, recordMistakeReview, reopen } from './mistakes'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const NOW = new Date('2026-11-02T10:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

async function onlyMistake() {
  const [mistake] = await listMistakes(DEMO)
  if (!mistake) throw new Error('no mistake')
  return mistake
}

async function mistakeWhere(match: (mistake: Mistake) => boolean) {
  const mistake = (await listMistakes(DEMO)).find(match)
  if (!mistake) throw new Error('no such mistake')
  return mistake
}

async function cardWithId(id: string) {
  const card = (await listCards(DEMO)).find((c) => c.id === id)
  if (!card) throw new Error(`no card ${id}`)
  return card
}

describe('mistake notebook (Demo Mode + FSRS)', () => {
  it('adds a mistake that comes back after 1 day, schedules via FSRS across 3 days until fixed, and reopens cleanly', async () => {
    await addMistake(DEMO, { concept: 'BCNF vs 3NF', why_wrong: 'Mixed them up', correct_approach: 'BCNF: every determinant is a superkey' }, NOW)
    expect(await onlyMistake()).toMatchObject({ status: 'open', ladder_step: 0, fsrs: {}, next_review_at: new Date(NOW.getTime() + DAY).toISOString() })

    const dayOne = new Date(NOW.getTime() + DAY)
    await recordMistakeReview(DEMO, { mistake: await onlyMistake(), grade: 4, now: dayOne, timeZone: 'UTC' })
    const afterFirst = await onlyMistake()
    expect(afterFirst).toMatchObject({ status: 'open', ladder_step: 1, correct_count: 1, last_correct_on: '2026-11-03' })
    expect(mistakeFsrsStats(afterFirst.fsrs).stability).toBeGreaterThan(0)

    const nextDue = new Date(Math.max(Date.parse(afterFirst.next_review_at), dayOne.getTime() + 2 * DAY))
    await recordMistakeReview(DEMO, { mistake: afterFirst, grade: 3, now: nextDue, timeZone: 'UTC' })
    const afterSecond = await onlyMistake()
    expect(afterSecond).toMatchObject({ status: 'open', ladder_step: 2, correct_count: 2 })

    const thirdAt = new Date(Math.max(Date.parse(afterSecond.next_review_at), nextDue.getTime() + 2 * DAY))
    await recordMistakeReview(DEMO, { mistake: afterSecond, grade: 3, now: thirdAt, timeZone: 'UTC' })
    expect(await onlyMistake()).toMatchObject({ status: 'fixed', correct_count: 3 })

    await reopen(DEMO, await onlyMistake())
    expect(await onlyMistake()).toMatchObject({ status: 'open', ladder_step: 0, correct_count: 0, last_correct_on: null, fsrs: {} })
  })

  it("notes a card or question once: noting it again while it's open logs FSRS Again and resets count", async () => {
    await noteMistake(DEMO, { concept: 'Q', flashcard_id: null, question_id: null }, NOW)
    expect(await listMistakes(DEMO)).toHaveLength(1)

    await addCards(DEMO, [{ id: 'card-1', front: 'What is 2PL?', back: 'Two-phase locking', source: 'manual' }])
    await noteMistake(DEMO, { concept: 'What is 2PL?', flashcard_id: 'card-1' }, NOW)
    const first = await mistakeWhere((m) => m.flashcard_id === 'card-1')
    await recordMistakeReview(DEMO, { mistake: first, grade: 4, now: new Date(NOW.getTime() + DAY), timeZone: 'UTC' })

    await noteMistake(DEMO, { concept: 'What is 2PL?', flashcard_id: 'card-1' }, new Date(NOW.getTime() + 2 * DAY))
    const forCard = (await listMistakes(DEMO)).filter((m) => m.flashcard_id === 'card-1')
    expect(forCard).toHaveLength(1)
    expect(forCard[0]).toMatchObject({ ladder_step: 0, correct_count: 0 })
    expect(mistakeFsrsStats(forCard[0]!.fsrs).lapses).toBe(1)
  })

  it('puts a forgotten flashcard (Again on a learned card) in the notebook, but not Again while learning', async () => {
    const scheduler = await getScheduler(0.9, false)
    await addCards(DEMO, [{ id: 'new', front: 'New card', back: 'A', source: 'manual' }])
    const learnedState = reviewCard(scheduler, reviewCard(scheduler, {}, 3, new Date(NOW.getTime() - 20 * DAY)).fsrs, 3, new Date(NOW.getTime() - 19 * DAY))
    await addCards(DEMO, [{ id: 'learned', front: 'What is BCNF?', back: 'Every determinant is a superkey', source: 'manual', fsrs: learnedState.fsrs, due_at: NOW.toISOString() }])

    await recordReview(DEMO, { card: await cardWithId('new'), grade: 1, durationMs: 1000, scheduler, now: NOW })
    expect(await listMistakes(DEMO)).toEqual([])

    await recordReview(DEMO, { card: await cardWithId('learned'), grade: 1, durationMs: 1000, scheduler, now: NOW })
    expect(await listMistakes(DEMO)).toEqual([
      expect.objectContaining({ concept: 'What is BCNF?', correct_approach: 'Every determinant is a superkey', flashcard_id: 'learned', status: 'open' }),
    ])
  })

  it('makes a flashcard from a mistake and links it, once the correct approach is written', async () => {
    await addMistake(DEMO, { concept: 'Joins', correct_approach: null }, NOW)
    await expect(makeCardFromMistake(DEMO, await onlyMistake())).rejects.toThrow(/correct approach first/)

    await addMistake(DEMO, { concept: 'Left join keeps?', correct_approach: 'Every row of the left table' }, NOW)
    await makeCardFromMistake(DEMO, await mistakeWhere((m) => m.concept === 'Left join keeps?'))
    const [card] = await listCards(DEMO)
    expect(card).toMatchObject({ front: 'Left join keeps?', back: 'Every row of the left table', source: 'mistake' })
    expect(await mistakeWhere((m) => m.concept === 'Left join keeps?')).toMatchObject({ flashcard_id: card?.id })
  })
})
