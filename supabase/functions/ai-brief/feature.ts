import type { AiFeature } from '../_shared/http.ts'
import { BRIEF_PROMPT_VERSION, briefInstructions, briefPrompt } from '../_shared/prompts/brief.ts'
import { BriefAnswerSchema, BriefRequestSchema, type BriefRequest, type BriefResponse } from '../_shared/schemas.ts'

/** Today's plan, deadlines and last check-in → the 3-line morning brief (the app keeps it for the day). */
export const briefFeature: AiFeature<BriefRequest, BriefResponse> = {
  feature: 'brief',
  input: BriefRequestSchema,
  async run({ input, userId, ai }) {
    const { data, model } = await ai.generate({
      userId,
      feature: 'brief',
      tier: 'fast',
      schema: BriefAnswerSchema,
      instructions: briefInstructions(input),
      prompt: briefPrompt(input),
    })
    return { lines: data.lines, model, promptVersion: BRIEF_PROMPT_VERSION }
  },
}
