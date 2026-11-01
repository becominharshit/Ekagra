import type { AiFeature } from '../_shared/http.ts'
import { MEAL_INSTRUCTIONS, MEAL_PROMPT_VERSION, mealPrompt } from '../_shared/prompts/meal.ts'
import { MealAnswerSchema, MealRequestSchema, type MealRequest, type MealResponse } from '../_shared/schemas.ts'

/** A meal photo and/or note → each food with estimated calories and macros. The photo is not stored. */
export const mealFeature: AiFeature<MealRequest, MealResponse> = {
  feature: 'meal',
  input: MealRequestSchema,
  async run({ input, userId, ai }) {
    const { data, model } = await ai.generate({
      userId,
      feature: 'meal',
      tier: 'fast',
      schema: MealAnswerSchema,
      instructions: MEAL_INSTRUCTIONS,
      prompt: mealPrompt(input),
    })
    // Whole numbers, as the student sees them.
    const items = data.items.map((item) => ({
      ...item,
      calories: Math.round(item.calories),
      protein_g: Math.round(item.protein_g),
      carbs_g: Math.round(item.carbs_g),
      fat_g: Math.round(item.fat_g),
    }))
    return { items, confidence: data.confidence, note: data.note, model, promptVersion: MEAL_PROMPT_VERSION }
  },
}
