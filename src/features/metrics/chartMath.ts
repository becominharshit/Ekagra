// The maths behind the Progress charts, drawn by hand in SVG (no chart library). In SVG, y grows
// downwards, so a bigger value gets a smaller y. Pure functions, tested on their own.

export type Range = [min: number, max: number]

const round1 = (value: number) => Math.round(value * 10) / 10

/**
 * The values a chart shows: from the smallest to the biggest (extras, such as a target, included)
 * with 10% room, kept within `floor` and `ceiling`. One value alone still gets a little range.
 */
export function chartRange(values: (number | null)[], { extra = [], floor, ceiling }: { extra?: number[]; floor?: number; ceiling?: number } = {}): Range {
  const known = [...values, ...extra].filter((value): value is number => value !== null && Number.isFinite(value))
  if (known.length === 0) return [floor ?? 0, ceiling ?? 1]
  let min = Math.min(...known)
  let max = Math.max(...known)
  const room = max > min ? (max - min) * 0.1 : Math.abs(max) * 0.1 || 1
  min -= room
  max += room
  if (floor !== undefined) min = Math.max(floor, min)
  if (ceiling !== undefined) max = Math.min(ceiling, max)
  return max > min ? [min, max] : [min, min + 1]
}

/** Where a value goes between `top` (the range's max) and `bottom` (its min). */
export function yFor(value: number, [min, max]: Range, top: number, bottom: number): number {
  return round1(bottom - ((value - min) / (max - min)) * (bottom - top))
}

/** `count` points spread evenly from `left` to `right`. */
export function xPositions(count: number, left: number, right: number): number[] {
  if (count <= 1) return [round1((left + right) / 2)]
  return Array.from({ length: count }, (_, index) => round1(left + (index * (right - left)) / (count - 1)))
}

/** An SVG path through the values, broken where one is missing (a week without practice). */
export function linePath(values: (number | null)[], xs: number[], y: (value: number) => number): string {
  const parts: string[] = []
  let drawing = false
  values.forEach((value, index) => {
    if (value === null) {
      drawing = false
      return
    }
    parts.push(`${drawing ? 'L' : 'M'}${xs[index] ?? 0} ${y(value)}`)
    drawing = true
  })
  return parts.join(' ')
}
