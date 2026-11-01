import { describe, expect, it } from 'vitest'
import { PEAK_WINDOWS, STANDARD_BUDGET } from '@/features/planner/planner'
import type { Area, Budget } from '@/features/planner/types'
import {
  peakWindowFor,
  plannerSettingsFor,
  readSettings,
  rebalanceBudget,
  toChronotype,
  toMentorTone,
} from './settings'

const PLANNER_DEFAULTS = { bufferPct: 12, revisionDays: 10, maxReviewMinutes: 30, maxDailyIncreasePct: 20 }

describe('readSettings', () => {
  it('uses the defaults when nothing usable is saved', () => {
    for (const raw of [undefined, null, {}, 'oops', 42, []]) {
      const settings = readSettings(raw)
      expect(settings.budget).toEqual(STANDARD_BUDGET)
      expect(settings.planner).toEqual(PLANNER_DEFAULTS)
    }
  })

  it('reads the flashcard settings, with 20 new cards a day and 90% retention by default', () => {
    expect(readSettings({}).learning).toEqual({ newCardsPerDay: 20, targetRetention: 0.9 })
    expect(readSettings({ learning: { newCardsPerDay: 10, targetRetention: 0.99, language: 'en' } }).learning).toEqual({
      newCardsPerDay: 10,
      targetRetention: 0.9, // 99% is outside 80–95%
      language: 'en',
    })
  })

  it('keeps settings it does not know about yet (focus, tollbooth, theme …)', () => {
    const saved = {
      budget: { academics: 55, hustle: 25, life: 20 },
      planner: PLANNER_DEFAULTS,
      learning: { newCardsPerDay: 20, targetRetention: 0.9, language: 'en' },
      focus: { pomodoro: { work: 25, break: 5 } },
      tollbooth: { questions: 3 },
      theme: 'dark',
    }
    expect(readSettings(saved)).toEqual(saved)
  })

  it('replaces only the broken values with their defaults', () => {
    const settings = readSettings({
      budget: { academics: 70, hustle: 20, life: 20 }, // adds up to 110%
      planner: { bufferPct: 15, revisionDays: -3, peakStart: '18:00', peakEnd: '9 pm' },
      theme: 'dark',
    })
    expect(settings.budget).toEqual(STANDARD_BUDGET)
    expect(settings.planner).toEqual({ ...PLANNER_DEFAULTS, bufferPct: 15, peakStart: '18:00' })
    expect(settings.theme).toBe('dark')
  })

  it('uses the planner defaults when the planner part is broken, and keeps a good budget', () => {
    const settings = readSettings({ budget: { academics: 60, hustle: 20, life: 20 }, planner: 'oops' })
    expect(settings.budget).toEqual({ academics: 60, hustle: 20, life: 20 })
    expect(settings.planner).toEqual(PLANNER_DEFAULTS)
  })
})

describe('peakWindowFor', () => {
  it("uses the rhythm's usual hours until the student picks their own", () => {
    expect(peakWindowFor(readSettings({}), 'early')).toEqual({ start: '07:00', end: '11:00' })
    expect(peakWindowFor(readSettings({}), 'night')).toEqual({ start: '18:00', end: '22:00' })
  })

  it('uses the saved hours when both are there and in the right order', () => {
    const settings = readSettings({ planner: { peakStart: '20:00', peakEnd: '23:30' } })
    expect(peakWindowFor(settings, 'neutral')).toEqual({ start: '20:00', end: '23:30' })
  })

  it('ignores saved hours that are half missing or back to front', () => {
    const neutral = { start: '09:00', end: '13:00' }
    expect(peakWindowFor(readSettings({ planner: { peakStart: '20:00' } }), 'neutral')).toEqual(neutral)
    expect(peakWindowFor(readSettings({ planner: { peakStart: '20:00', peakEnd: '08:00' } }), 'neutral')).toEqual(neutral)
  })
})

describe('plannerSettingsFor', () => {
  it('gives the planner the budget, the planner numbers and the focus hours in minutes', () => {
    const settings = readSettings({ budget: { academics: 60, hustle: 20, life: 20 }, planner: { bufferPct: 10 } })
    expect(plannerSettingsFor(settings, 'night')).toEqual({
      budget: { academics: 60, hustle: 20, life: 20 },
      bufferPct: 10,
      revisionDays: 10,
      maxReviewMinutes: 30,
      maxDailyIncreasePct: 20,
      peakWindow: PEAK_WINDOWS.night,
    })
  })
})

describe('rebalanceBudget', () => {
  it('shares what is left between the other two in their current proportion', () => {
    expect(rebalanceBudget(STANDARD_BUDGET, 'academics', 75)).toEqual({ academics: 75, hustle: 15, life: 10 })
  })

  it('always adds up to 100, in steps of 5, never below 0', () => {
    const moves: [Area, number][] = [
      ['hustle', 62],
      ['life', 0],
      ['academics', 100],
      ['life', 35],
      ['academics', 3],
    ]
    let budget: Budget = { ...STANDARD_BUDGET }
    for (const [area, value] of moves) {
      budget = rebalanceBudget(budget, area, value)
      expect(budget.academics + budget.hustle + budget.life).toBe(100)
      for (const part of Object.values(budget)) {
        expect(part % 5).toBe(0)
        expect(part).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('splits evenly when the other two are both 0', () => {
    expect(rebalanceBudget({ academics: 100, hustle: 0, life: 0 }, 'academics', 50)).toEqual({
      academics: 50,
      hustle: 25,
      life: 25,
    })
  })

  it('rounds the moved slider to a step of 5 between 0 and 100, without changing the old budget', () => {
    const before = { ...STANDARD_BUDGET }
    expect(rebalanceBudget(before, 'life', 23).life).toBe(25)
    expect(rebalanceBudget(before, 'life', 120).life).toBe(100)
    expect(rebalanceBudget(before, 'life', -10).life).toBe(0)
    expect(before).toEqual(STANDARD_BUDGET)
  })
})

describe('toChronotype and toMentorTone', () => {
  it('keep known values and fall back for anything else', () => {
    expect(toChronotype('night')).toBe('night')
    expect(toChronotype('owl')).toBe('neutral')
    expect(toChronotype(null)).toBe('neutral')
    expect(toMentorTone('strict')).toBe('strict')
    expect(toMentorTone('')).toBe('balanced')
  })
})
