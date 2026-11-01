import type { AiFeature } from '../_shared/http.ts'
import { REVIEW_PROMPT_VERSION, reviewInstructions, reviewPrompt } from '../_shared/prompts/review.ts'
import { reviewAnswerSchemaFor, ReviewRequestSchema, type ReviewRequest, type ReviewResponse } from '../_shared/schemas.ts'

/** The week's numbers → 3 insights and up to 3 changes the app can apply (Smart tier: once a week). */
export const reviewFeature: AiFeature<ReviewRequest, ReviewResponse> = {
  feature: 'review',
  input: ReviewRequestSchema,
  async run({ input, userId, ai }) {
    const { data, model } = await ai.generate({
      userId,
      feature: 'review',
      tier: 'smart',
      schema: reviewAnswerSchemaFor(input),
      instructions: reviewInstructions(input),
      prompt: reviewPrompt(input),
    })
    return { insights: data.insights, changes: data.changes, model, promptVersion: REVIEW_PROMPT_VERSION }
  },
}
