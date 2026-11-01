import type { AiFeature } from '../_shared/http.ts'
import { TUTOR_PROMPT_VERSION, tutorInstructions, tutorPrompt } from '../_shared/prompts/tutor.ts'
import { TutorAnswerSchema, TutorRequestSchema, type TutorRequest, type TutorResponse } from '../_shared/schemas.ts'

/** 1-click AI Anchors (explain, simplify, example, flashcards) and "Ask about this page". */
export const tutorFeature: AiFeature<TutorRequest, TutorResponse> = {
  feature: 'tutor',
  input: TutorRequestSchema,
  async run({ input, userId, ai }) {
    const { data, model } = await ai.generate({
      userId,
      // Shows in ai_usage whether the cost came from anchors or from questions.
      feature: input.action === 'ask' ? 'tutor' : 'anchor',
      tier: 'fast',
      schema: TutorAnswerSchema,
      instructions: tutorInstructions(input),
      prompt: tutorPrompt(input),
    })
    return {
      answerMd: data.answerMd,
      flashcards: input.action === 'flashcards' ? data.flashcards : [],
      model,
      promptVersion: TUTOR_PROMPT_VERSION,
    }
  },
}
