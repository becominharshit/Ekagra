import { describe, expect, it } from 'vitest'
import { pickQuickWin, type QuickWinInput } from './quickWin'

const base: QuickWinInput = {
  dueCards: 0,
  dueMistakes: 0,
  blocks: [],
  topics: [],
}

describe('pickQuickWin ("I have X minutes")', () => {
  it('picks due flashcards first for a 10 or 20 minute break', () => {
    const res = pickQuickWin(10, {
      ...base,
      dueCards: 14,
      dueMistakes: 3,
      blocks: [{ id: 'b1', title: 'DBMS Unit 2', status: 'planned', planned_minutes: 45, actual_minutes: null, start_at: '2026-11-08T14:00:00Z' }],
    })
    expect(res).toMatchObject({
      title: 'Review 14 due flashcards',
      to: '/academics/flashcards',
    })
  })

  it('picks open mistakes when no flashcards are due in a 10-minute gap', () => {
    const res = pickQuickWin(10, { ...base, dueMistakes: 2 })
    expect(res).toMatchObject({
      title: 'Clear 2 open mistakes',
      to: '/academics/mistakes',
    })
  })

  it("picks today's planned block when the student has 30 or 45 minutes", () => {
    const res = pickQuickWin(30, {
      ...base,
      dueCards: 5,
      blocks: [{ id: 'b1', title: 'SQL Joins', status: 'planned', planned_minutes: 35, actual_minutes: 0, start_at: '2026-11-08T15:00:00Z' }],
    })
    expect(res).toMatchObject({
      title: 'SQL Joins',
      to: '/today/focus?block=b1',
    })
  })

  it('falls back to the highest-priority unmastered topic when no blocks are planned today', () => {
    const res = pickQuickWin(30, {
      ...base,
      topics: [
        { id: 't1', title: 'ER Diagrams', parent_id: 'u1', status: 'not_started', priority_score: 0.4, est_minutes: 25 },
        { id: 't2', title: 'BCNF Normalization', parent_id: 'u1', status: 'learning', priority_score: 0.9, est_minutes: 30 },
      ],
    })
    expect(res).toMatchObject({
      title: 'Study: BCNF Normalization',
      to: '/academics/topics/t2',
    })
  })
})
