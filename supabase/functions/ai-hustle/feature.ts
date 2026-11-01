import type { AiFeature } from '../_shared/http.ts'
import { HUSTLE_INSTRUCTIONS, HUSTLE_PROMPT_VERSION, hustlePrompt } from '../_shared/prompts/hustle.ts'
import { HustlePlanAnswerSchema, HustlePlanRequestSchema, type HustlePlanRequest, type HustlePlanResponse } from '../_shared/schemas.ts'

/** The student's own hustle idea → name, phases with steps (and the skills they need), board columns. */
export const hustleFeature: AiFeature<HustlePlanRequest, HustlePlanResponse> = {
  feature: 'hustle',
  input: HustlePlanRequestSchema,
  async run({ input, userId, ai }) {
    const { data, model } = await ai.generate({
      userId,
      feature: 'hustle',
      tier: 'smart',
      schema: HustlePlanAnswerSchema,
      instructions: HUSTLE_INSTRUCTIONS,
      prompt: hustlePrompt(input),
    })
    return { ...data, model, promptVersion: HUSTLE_PROMPT_VERSION }
  },
}
