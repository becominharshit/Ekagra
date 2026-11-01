import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { stubLocalStorage } from '@/test/memoryStorage'
import { addMeal, deleteMeal, estimateMeal, listMeals } from './mealsData'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }

describe('meals in Demo Mode', () => {
  it('adds meals in time order from a date on, and deletes them', async () => {
    await addMeal(DEMO, { meal: 'dinner', description: '2 roti with dal', source: 'preset', eatenAt: '2026-11-02T15:00:00.000Z', calories: 380, protein_g: 15.04 })
    await addMeal(DEMO, { meal: 'breakfast', description: 'Poha', source: 'manual', eatenAt: '2026-11-02T02:30:00.000Z' })
    await addMeal(DEMO, { meal: 'lunch', description: 'Yesterday', source: 'manual', eatenAt: '2026-11-01T07:00:00.000Z' })
    const meals = await listMeals(DEMO, '2026-11-01T18:30:00.000Z')
    expect(meals.map((meal) => [meal.description, meal.calories, meal.protein_g])).toEqual([
      ['Poha', null, null],
      ['2 roti with dal', 380, 15],
    ])
    await deleteMeal(DEMO, meals[0]?.id ?? '')
    expect(await listMeals(DEMO, '2026-11-01T18:30:00.000Z')).toHaveLength(1)
    await expect(addMeal(DEMO, { meal: 'lunch', description: '', source: 'manual', eatenAt: '2026-11-02T07:00:00.000Z' })).rejects.toThrow(/what you ate/)
  })

  it('gives a clearly marked sample instead of an AI estimate', async () => {
    const estimate = await estimateMeal(DEMO, { meal: 'snack', note: 'maggi' })
    expect(estimate).toMatchObject({ by: 'sample', confidence: 'low' })
    expect(estimate.items.map((item) => item.name)).toEqual(['Maggi'])
  })
})
