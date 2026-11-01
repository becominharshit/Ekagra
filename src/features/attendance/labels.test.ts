import { describe, expect, it } from 'vitest'
import type { ClassSlot } from './attendance'
import { percentLabel, slotsLabel } from './labels'

describe('percentLabel', () => {
  it('rounds down, so 74.96% never shows as 75%', () => {
    expect(percentLabel(74.96)).toBe('74.9%')
    expect(percentLabel(75)).toBe('75%')
    expect(percentLabel(200 / 3)).toBe('66.6%')
    expect(percentLabel(100)).toBe('100%')
    expect(percentLabel(null)).toBe('–')
  })
})

describe('slotsLabel', () => {
  const slot = (daysOfWeek: number[], start: string, end: string): ClassSlot => ({ subjectId: 's', start, end, daysOfWeek, validFrom: null, validTo: null })

  it('groups days with the same time, Monday first', () => {
    expect(slotsLabel([slot([5], '14:00', '16:00'), slot([3, 1], '09:00', '10:00')])).toBe('Mon, Wed 09:00–10:00 · Fri 14:00–16:00')
    expect(slotsLabel([slot([0, 6], '10:00', '11:00')])).toBe('Sat, Sun 10:00–11:00')
    expect(slotsLabel([])).toBe('')
  })
})
