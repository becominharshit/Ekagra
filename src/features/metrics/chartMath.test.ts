import { describe, expect, it } from 'vitest'
import { chartRange, linePath, xPositions, yFor } from './chartMath'

describe('chartRange', () => {
  it('spans the values with 10% room, extras included, within the limits', () => {
    const [min, max] = chartRange([0.8, null, 0.9])
    expect(min).toBeCloseTo(0.79)
    expect(max).toBeCloseTo(0.91)
    expect(chartRange([0.8], { extra: [0.85, 0.9] })[1]).toBeCloseTo(0.91)
    const [low, high] = chartRange([0.2, 0.95], { floor: 0, ceiling: 1 })
    expect(low).toBeCloseTo(0.125)
    expect(high).toBe(1)
  })

  it('never draws a flat line or an empty chart', () => {
    expect(chartRange([20])).toEqual([18, 22])
    expect(chartRange([0])).toEqual([-1, 1])
    expect(chartRange([null, null], { floor: 0, ceiling: 1 })).toEqual([0, 1])
  })
})

describe('positions and paths', () => {
  it('puts bigger values higher (smaller y)', () => {
    expect(yFor(1, [0, 1], 10, 90)).toBe(10)
    expect(yFor(0, [0, 1], 10, 90)).toBe(90)
    expect(yFor(0.25, [0, 1], 10, 90)).toBe(70)
  })

  it('spreads points evenly', () => {
    expect(xPositions(3, 40, 300)).toEqual([40, 170, 300])
    expect(xPositions(1, 40, 300)).toEqual([170])
  })

  it('breaks the line where a week is missing', () => {
    expect(linePath([1, 2, null, 4, 5], [0, 10, 20, 30, 40], (value) => value * 10)).toBe('M0 10 L10 20 M30 40 L40 50')
    expect(linePath([null, null], [0, 10], (value) => value)).toBe('')
  })
})
