import { MealResponseSchema, type MealItem, type MealRequest } from '@shared/schemas.ts'
import { useMutation, useQuery } from '@tanstack/react-query'
import { callAiFunction } from '@/features/ai/aiClient'
import { dbError, need, readAll, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { lifeKey } from '../lifeData'
import { mealProblem, sampleEstimate, type Meal, type MealInput } from './meals'

// Meals, saved in Supabase or (Demo Mode) on the device, and estimates from a photo. The photo
// goes to ai-meal in the request and nowhere else: it isn't uploaded or kept.

const byTime = (a: Meal, b: Meal) => a.eaten_at.localeCompare(b.eaten_at)

/** Meals eaten from `since` (an ISO time) on, oldest first. */
export async function listMeals(source: DataSource, since: string): Promise<Meal[]> {
  if (source.kind === 'demo') return demoDb.list('meals').filter((meal) => Date.parse(meal.eaten_at) >= Date.parse(since)).sort(byTime)
  const rows = await readAll((from, to) => source.client.from('meals').select('*').eq('user_id', source.userId).gte('eaten_at', since).order('id').range(from, to))
  return rows.sort(byTime)
}

export async function addMeal(source: DataSource, input: MealInput): Promise<void> {
  const problem = mealProblem(input)
  if (problem) throw new Error(problem)
  const round1 = (value: number | undefined) => (value === undefined ? null : Math.round(value * 10) / 10)
  const row = {
    meal: input.meal,
    description: input.description.trim(),
    eaten_at: input.eatenAt,
    calories: round1(input.calories),
    protein_g: round1(input.protein_g),
    carbs_g: round1(input.carbs_g),
    fat_g: round1(input.fat_g),
    source: input.source,
  }
  if (source.kind === 'demo') {
    demoDb.insert('meals', [row])
    return
  }
  const { error } = await source.client.from('meals').insert(row)
  if (error) throw dbError(error)
}

export async function deleteMeal(source: DataSource, id: string): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.remove('meals', [id])
    return
  }
  const { error } = await source.client.from('meals').delete().eq('id', id)
  if (error) throw dbError(error)
}

export interface MealEstimate {
  items: MealItem[]
  confidence: 'low' | 'medium' | 'high'
  note: string
  /** 'sample' in Demo Mode: not a real estimate. */
  by: 'ai' | 'sample'
}

/** Estimates a meal from a photo and/or a note: ai-meal when signed in, a sample in Demo Mode. */
export async function estimateMeal(source: DataSource, request: MealRequest): Promise<MealEstimate> {
  if (source.kind === 'demo') {
    return { items: sampleEstimate(request.note), confidence: 'low', note: 'Demo Mode has no AI: this is a sample from the mess and hostel list.', by: 'sample' }
  }
  const answer = await callAiFunction('ai-meal', request, MealResponseSchema, source.client)
  return { items: answer.items, confidence: answer.confidence, note: answer.note, by: 'ai' }
}

export function useMeals(since: string) {
  const { source, owner } = useDataSource()
  return useQuery({ queryKey: [...lifeKey(owner), 'meals', since], queryFn: () => listMeals(need(source), since), enabled: source !== null })
}

/** Estimates a meal; nothing is saved until the student checks the numbers and taps Save. */
export function useEstimateMeal() {
  const { source } = useDataSource()
  return useMutation({ mutationFn: (request: MealRequest) => estimateMeal(need(source), request) })
}
