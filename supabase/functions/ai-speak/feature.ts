import type { AiFeature } from '../_shared/http.ts'
import { SPEAK_INSTRUCTIONS, SPEAK_PROMPT_VERSION, speakPrompt } from '../_shared/prompts/speak.ts'
import { SpeakAnswerSchema, SpeakRequestSchema, type SpeakRequest, type SpeakResponse } from '../_shared/schemas.ts'

const wholeScore = (value: number) => Math.min(10, Math.max(1, Math.round(value)))

/** What the student said (as text, with the app's counts) → 4 scores, a strength and tips. The recording never leaves the phone. */
export const speakFeature: AiFeature<SpeakRequest, SpeakResponse> = {
  feature: 'speak',
  input: SpeakRequestSchema,
  async run({ input, userId, ai }) {
    const { data, model } = await ai.generate({
      userId,
      feature: 'speak',
      tier: 'fast',
      schema: SpeakAnswerSchema,
      instructions: SPEAK_INSTRUCTIONS,
      prompt: speakPrompt(input),
    })
    const { clarity, structure, vocabulary, confidence } = data.scores
    return {
      scores: { clarity: wholeScore(clarity), structure: wholeScore(structure), vocabulary: wholeScore(vocabulary), confidence: wholeScore(confidence) },
      strength: data.strength,
      tips: data.tips,
      model,
      promptVersion: SPEAK_PROMPT_VERSION,
    }
  },
}
