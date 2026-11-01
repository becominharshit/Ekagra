import { MEAL_SLOTS, type MealItem } from '@shared/schemas.ts'
import { addDays, format, parseISO } from 'date-fns'
import type { Tables } from '@/types/database'

// Meals: the four meals of a day, hostel and mess presets with typical estimates, daily totals
// against the student's targets, and a sample estimate for Demo Mode. All numbers are estimates.
// Pure functions, tested on their own.

export type Meal = Tables<'meals'>
export type MealSlot = (typeof MEAL_SLOTS)[number]
export { MEAL_SLOTS }

export const MEAL_LABEL: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snacks', dinner: 'Dinner' }

export interface Macros {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export interface MealPreset extends Macros {
  name: string
  group: 'Breakfast' | 'Meals' | 'Snacks and drinks'
}

const preset = (group: MealPreset['group'], name: string, calories: number, protein_g: number, carbs_g: number, fat_g: number): MealPreset => ({ group, name, calories, protein_g, carbs_g, fat_g })

/** Common hostel and mess food, one typical serving each (rough averages). */
export const MEAL_PRESETS: MealPreset[] = [
  preset('Breakfast', 'Poha (1 plate)', 250, 5, 45, 7),
  preset('Breakfast', 'Upma (1 plate)', 280, 7, 42, 9),
  preset('Breakfast', 'Idli (3) with sambar', 300, 10, 55, 4),
  preset('Breakfast', 'Masala dosa with chutney', 400, 8, 55, 16),
  preset('Breakfast', 'Aloo paratha (2) with curd', 550, 13, 70, 24),
  preset('Breakfast', 'Bread omelette (2 eggs)', 350, 18, 28, 18),
  preset('Breakfast', 'Boiled eggs (2)', 155, 13, 1, 11),
  preset('Meals', 'Mess thali (rice, dal, sabzi, 2 roti)', 750, 22, 120, 20),
  preset('Meals', '2 roti with dal', 380, 15, 60, 8),
  preset('Meals', 'Rice with dal (1 plate)', 450, 14, 80, 8),
  preset('Meals', 'Rajma chawal', 550, 18, 90, 12),
  preset('Meals', 'Chole bhature (2)', 700, 18, 80, 35),
  preset('Meals', 'Paneer sabzi with 2 roti', 550, 22, 50, 28),
  preset('Meals', 'Veg biryani (1 plate)', 500, 11, 75, 17),
  preset('Meals', 'Chicken biryani (1 plate)', 650, 30, 75, 24),
  preset('Meals', 'Egg curry with rice', 600, 22, 75, 22),
  preset('Meals', 'Curd (1 bowl)', 100, 5, 7, 5),
  preset('Snacks and drinks', 'Samosa (1)', 260, 4, 30, 14),
  preset('Snacks and drinks', 'Maggi (1 packet)', 350, 8, 50, 14),
  preset('Snacks and drinks', 'Peanut chikki (2 pieces)', 200, 6, 22, 10),
  preset('Snacks and drinks', 'Sprouts chaat (1 bowl)', 150, 9, 25, 2),
  preset('Snacks and drinks', 'Banana (1)', 105, 1, 27, 0),
  preset('Snacks and drinks', 'Chai with sugar (1 cup)', 90, 2, 14, 3),
  preset('Snacks and drinks', 'Milk (1 glass)', 150, 8, 12, 8),
]

export const PRESET_GROUPS: MealPreset['group'][] = ['Breakfast', 'Meals', 'Snacks and drinks']

/** The meal a time of day usually is: after midnight a late snack, from 5 breakfast, from 11 lunch, from 16 snacks, from 19 dinner. */
export function slotFor(date: Date): MealSlot {
  const hour = date.getHours()
  if (hour < 5) return 'snack'
  if (hour < 11) return 'breakfast'
  if (hour < 16) return 'lunch'
  if (hour < 19) return 'snack'
  return 'dinner'
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

/** Calories and macros added up (missing numbers count as 0). */
export function totals(meals: Pick<Meal, 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'>[]): Macros {
  return {
    calories: Math.round(sum(meals.map((meal) => Number(meal.calories ?? 0)))),
    protein_g: Math.round(sum(meals.map((meal) => Number(meal.protein_g ?? 0)))),
    carbs_g: Math.round(sum(meals.map((meal) => Number(meal.carbs_g ?? 0)))),
    fat_g: Math.round(sum(meals.map((meal) => Number(meal.fat_g ?? 0)))),
  }
}

/** Calories eaten on each of the last `days` days (local dates), oldest first, today last. */
export function caloriesByDay(meals: Pick<Meal, 'eaten_at' | 'calories'>[], today: string, days = 7): { date: string; calories: number }[] {
  const byDate = new Map<string, number>()
  for (const meal of meals) {
    const date = format(new Date(meal.eaten_at), 'yyyy-MM-dd')
    byDate.set(date, (byDate.get(date) ?? 0) + Number(meal.calories ?? 0))
  }
  return Array.from({ length: days }, (_, index) => {
    const date = format(addDays(parseISO(today), index - days + 1), 'yyyy-MM-dd')
    return { date, calories: Math.round(byDate.get(date) ?? 0) }
  })
}

/** Cheap hostel and mess food with the most protein for its calories (at least 5 g a serving). */
export function proteinIdeas(count = 4): MealPreset[] {
  return MEAL_PRESETS.filter((item) => item.protein_g >= 5)
    .sort((a, b) => b.protein_g / b.calories - a.protein_g / a.calories)
    .slice(0, count)
}

/** An estimate's foods as one meal: their names and the summed numbers. */
export function fromItems(items: MealItem[]): { description: string } & Macros {
  return {
    description: items.map((item) => `${item.name} (${item.portion})`).join(', ').slice(0, 300),
    calories: Math.round(sum(items.map((item) => item.calories))),
    protein_g: Math.round(sum(items.map((item) => item.protein_g))),
    carbs_g: Math.round(sum(items.map((item) => item.carbs_g))),
    fat_g: Math.round(sum(items.map((item) => item.fat_g))),
  }
}

/** Demo Mode (no AI): presets whose name matches the note, or a sample mess thali. Clearly a sample. */
export function sampleEstimate(note: string | undefined): MealItem[] {
  const words = (note ?? '').toLowerCase()
  const found = MEAL_PRESETS.filter((item) => {
    const key = item.name.toLowerCase().split(/[ (]/)[0] ?? ''
    return key.length >= 3 && words.includes(key)
  })
  const picked = found.length > 0 ? found.slice(0, 4) : MEAL_PRESETS.filter((item) => item.name.startsWith('Mess thali'))
  return picked.map((item) => {
    // "Samosa (1)" → Samosa, 1 piece; "Milk (1 glass)" → Milk, 1 glass; "Idli (3) with sambar" stays whole.
    const [, name, amount] = item.name.match(/^(.*) \(([^)]*)\)$/) ?? []
    const portion = !amount ? '1 serving' : /^\d+$/.test(amount) ? `${amount} ${amount === '1' ? 'piece' : 'pieces'}` : amount
    return { name: name ?? item.name, portion, calories: item.calories, protein_g: item.protein_g, carbs_g: item.carbs_g, fat_g: item.fat_g }
  })
}

export interface MealInput extends Partial<Macros> {
  meal: MealSlot
  description: string
  source: 'photo' | 'preset' | 'manual'
  eatenAt: string
}

/** Why daily targets can't be saved (the limits of the settings); null when they're fine. */
export function targetsProblem(calories: number, protein: number): string | null {
  if (!Number.isFinite(calories) || calories < 800 || calories > 6000) return 'Calories: between 800 and 6,000 a day.'
  if (!Number.isFinite(protein) || protein < 10 || protein > 400) return 'Protein: between 10 and 400 g a day.'
  return null
}

/** Why a meal can't be saved, in plain words; null when it's fine. */
export function mealProblem(input: MealInput): string | null {
  if (!input.description.trim()) return 'Say what you ate.'
  if (input.description.trim().length > 300) return 'Keep the description under 300 characters.'
  const limits: [keyof Macros, number][] = [
    ['calories', 10000],
    ['protein_g', 1000],
    ['carbs_g', 1000],
    ['fat_g', 1000],
  ]
  for (const [field, max] of limits) {
    const value = input[field]
    if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > max)) return 'The numbers look wrong: check them.'
  }
  return null
}
