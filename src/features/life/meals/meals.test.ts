import { describe, expect, it } from 'vitest'
import { caloriesByDay, fromItems, MEAL_PRESETS, mealProblem, proteinIdeas, sampleEstimate, slotFor, targetsProblem, totals } from './meals'

describe('meals', () => {
  it('guesses the meal from the time of day', () => {
    expect([2, 8, 13, 17, 21].map((hour) => slotFor(new Date(2026, 10, 2, hour)))).toEqual(['snack', 'breakfast', 'lunch', 'snack', 'dinner'])
  })

  it('adds up the day, counting missing numbers as 0', () => {
    expect(totals([{ calories: 450, protein_g: 14, carbs_g: 80, fat_g: 8 }, { calories: 260.4, protein_g: null, carbs_g: 30, fat_g: 14 }])).toEqual({ calories: 710, protein_g: 14, carbs_g: 110, fat_g: 22 })
  })

  it('adds up the calories of each of the last 7 days, by local date', () => {
    const at = (day: number, hour: number) => new Date(2026, 10, day, hour).toISOString()
    const days = caloriesByDay(
      [
        { eaten_at: at(2, 8), calories: 300 },
        { eaten_at: at(2, 21), calories: 700.4 },
        { eaten_at: at(5, 13), calories: null },
        { eaten_at: at(8, 23), calories: 500 },
        { eaten_at: at(1, 13), calories: 900 }, // 8 days back: left out
      ],
      '2026-11-08',
    )
    expect(days.map((day) => [day.date, day.calories])).toEqual([
      ['2026-11-02', 1000],
      ['2026-11-03', 0],
      ['2026-11-04', 0],
      ['2026-11-05', 0],
      ['2026-11-06', 0],
      ['2026-11-07', 0],
      ['2026-11-08', 500],
    ])
  })

  it('suggests the presets with the most protein for their calories', () => {
    const ideas = proteinIdeas()
    expect(ideas).toHaveLength(4)
    expect(ideas[0]?.name).toBe('Boiled eggs (2)')
    for (const idea of ideas) expect(idea.protein_g).toBeGreaterThanOrEqual(5)
  })

  it("turns an estimate's foods into one meal", () => {
    const meal = fromItems([
      { name: 'Dal', portion: '1 bowl', calories: 180, protein_g: 9, carbs_g: 24, fat_g: 6 },
      { name: 'Roti', portion: '3 rotis', calories: 270, protein_g: 9, carbs_g: 54, fat_g: 3 },
    ])
    expect(meal).toEqual({ description: 'Dal (1 bowl), Roti (3 rotis)', calories: 450, protein_g: 18, carbs_g: 78, fat_g: 9 })
  })

  it('gives Demo Mode a sample from matching presets, or a mess thali', () => {
    expect(sampleEstimate('2 samosa and chai').map((item) => [item.name, item.portion])).toEqual([
      ['Samosa', '1 piece'],
      ['Chai with sugar', '1 cup'],
    ])
    expect(sampleEstimate('idli and milk').map((item) => [item.name, item.portion])).toEqual([
      ['Idli (3) with sambar', '1 serving'],
      ['Milk', '1 glass'],
    ])
    expect(sampleEstimate('boiled eggs').map((item) => [item.name, item.portion])).toContainEqual(['Boiled eggs', '2 pieces'])
    expect(sampleEstimate(undefined).map((item) => [item.name, item.portion])).toEqual([['Mess thali', 'rice, dal, sabzi, 2 roti']])
  })

  it('has sensible presets and checks what is saved', () => {
    for (const item of MEAL_PRESETS) expect(item.calories).toBeGreaterThan(0)
    const meal = { meal: 'lunch' as const, description: 'Thali', source: 'preset' as const, eatenAt: '2026-11-02T07:30:00.000Z', calories: 750 }
    expect(mealProblem(meal)).toBeNull()
    expect(mealProblem({ ...meal, description: ' ' })).toMatch(/what you ate/)
    expect(mealProblem({ ...meal, calories: -5 })).toMatch(/numbers/)
  })

  it('keeps daily targets within the limits of the settings', () => {
    expect(targetsProblem(2200, 70)).toBeNull()
    expect(targetsProblem(500, 70)).toMatch(/Calories/)
    expect(targetsProblem(2200, Number.NaN)).toMatch(/Protein/)
  })
})
