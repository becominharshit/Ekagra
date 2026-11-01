import type { AiFeature } from '../_shared/http.ts'
import { GENERATE_PROMPT_VERSION, generateInstructions, generatePrompt } from '../_shared/prompts/generate.ts'
import { GeneratedTopicSchema, GenerateRequestSchema, type GenerateRequest, type GenerateResponse } from '../_shared/schemas.ts'

/** One topic → its lesson, a 3–5 question check quiz and flashcards. Made once, when the student reaches the topic. */
export const generateFeature: AiFeature<GenerateRequest, GenerateResponse> = {
  feature: 'generate',
  input: GenerateRequestSchema,
  async run({ input, userId, ai }) {
    const { data, model } = await ai.generate({
      userId,
      feature: 'generate',
      tier: 'fast',
      schema: GeneratedTopicSchema,
      instructions: generateInstructions(input),
      prompt: generatePrompt(input),
    })
    return { ...data, model, promptVersion: GENERATE_PROMPT_VERSION }
  },
}
