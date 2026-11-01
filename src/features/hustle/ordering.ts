// Positions of cards in a pipeline board column. Each card has an order_index (a decimal number)
// and a column is sorted by it. Moving a card changes only that card: it gets a number between its
// new neighbours (between 1 and 2 → 1.5), so the rest of the column isn't saved again.
// Only when two numbers get too close to tell apart (after very many moves into the same gap)
// is the whole column numbered again: 1, 2, 3, … Plain functions, tested.

export interface Positioned {
  id: string
  order_index: number
}

/** A change to save: the card's new position (and its new column, when it moves to another one). */
export interface PositionUpdate {
  id: string
  order_index: number
  stage?: string
}

/** Smaller gaps than this are too close: the column is numbered again. */
const MIN_GAP = 1e-6

export const byPosition = (a: Positioned, b: Positioned) => a.order_index - b.order_index

/** A number between two neighbours; null = no card on that side. */
export function positionBetween(before: number | null, after: number | null): number {
  if (before === null) return after === null ? 1 : after - 1
  if (after === null) return before + 1
  return (before + after) / 2
}

/**
 * Puts `card` at `index` of `column` (the column without the card, in order).
 * Usually one update: the card's new position. If that would be too close to a neighbour,
 * every card in the column is numbered again.
 */
export function placeAt(column: Positioned[], card: Positioned, index: number, stage?: string): PositionUpdate[] {
  const others = column.filter((other) => other.id !== card.id)
  const at = Math.max(0, Math.min(index, others.length))
  const before = others[at - 1]?.order_index ?? null
  const after = others[at]?.order_index ?? null
  const position = positionBetween(before, after)
  const safe = (before === null || position - before >= MIN_GAP) && (after === null || after - position >= MIN_GAP)
  if (safe) return [{ id: card.id, order_index: position, ...(stage === undefined ? {} : { stage }) }]

  const ordered = [...others.slice(0, at), card, ...others.slice(at)]
  return ordered.map((other, position) => ({
    id: other.id,
    order_index: position + 1,
    ...(other.id === card.id && stage !== undefined ? { stage } : {}),
  }))
}

/** Moves a card one place up (-1) or down (+1) in its column. Empty = it's already at that end. */
export function moveInColumn(column: Positioned[], cardId: string, direction: -1 | 1): PositionUpdate[] {
  const ordered = [...column].sort(byPosition)
  const index = ordered.findIndex((card) => card.id === cardId)
  const card = ordered[index]
  const target = index + direction
  if (!card || target < 0 || target >= ordered.length) return []
  return placeAt(ordered, card, target)
}

/** Moves a card to the end of another column. */
export function moveToColumn(target: Positioned[], card: Positioned, stage: string): PositionUpdate[] {
  const ordered = [...target].sort(byPosition)
  return placeAt(ordered, card, ordered.length, stage)
}
