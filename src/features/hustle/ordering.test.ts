import { describe, expect, it } from 'vitest'
import { byPosition, moveInColumn, moveToColumn, placeAt, positionBetween, type Positioned } from './ordering'

const card = (id: string, order_index: number): Positioned => ({ id, order_index })

describe('positionBetween', () => {
  it('goes halfway between neighbours, and one past the ends', () => {
    expect(positionBetween(1, 2)).toBe(1.5)
    expect(positionBetween(null, 1)).toBe(0)
    expect(positionBetween(3, null)).toBe(4)
    expect(positionBetween(null, null)).toBe(1)
  })
})

describe('moving cards', () => {
  const column = [card('a', 1), card('b', 2), card('c', 3)]

  it('saves only the moved card: C moved up between A (1) and B (2) gets 1.5', () => {
    expect(moveInColumn(column, 'c', -1)).toEqual([{ id: 'c', order_index: 1.5 }])
    expect(moveInColumn(column, 'a', 1)).toEqual([{ id: 'a', order_index: 2.5 }])
    expect(moveInColumn(column, 'a', -1)).toEqual([]) // already at the top
    expect(moveInColumn(column, 'c', 1)).toEqual([]) // already at the bottom
  })

  it('moves a card to the end of another column, with its new stage', () => {
    expect(moveToColumn([card('x', 1), card('y', 7)], card('c', 3), 'Paid')).toEqual([{ id: 'c', order_index: 8, stage: 'Paid' }])
    expect(moveToColumn([], card('c', 3), 'Paid')).toEqual([{ id: 'c', order_index: 1, stage: 'Paid' }])
  })

  it('numbers the column again only when a gap gets too small, keeping the order', () => {
    // Keep moving a new card into the gap right after A: the gap halves every time.
    let cards = [card('a', 1), card('b', 2)]
    let renumbered = false
    for (let move = 0; move < 40 && !renumbered; move++) {
      const updates = placeAt([...cards].sort(byPosition), card(`n${move}`, 99), 1)
      renumbered = updates.length > 1
      const changed = new Map(updates.map((update) => [update.id, update.order_index]))
      cards = [...cards.map((other) => ({ ...other, order_index: changed.get(other.id) ?? other.order_index })), card(`n${move}`, changed.get(`n${move}`) ?? 0)]
    }
    expect(renumbered).toBe(true)
    const ordered = [...cards].sort(byPosition)
    expect(ordered[0]?.id).toBe('a')
    expect(ordered.at(-1)?.id).toBe('b')
    expect(new Set(ordered.map((other) => other.order_index)).size).toBe(ordered.length) // no two the same
    expect(ordered.map((other) => other.order_index)).toEqual(ordered.map((_, index) => index + 1))
  })
})
