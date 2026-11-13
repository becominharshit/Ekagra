import type { AiFeature } from '../_shared/http.ts'
import { STUDIO_QUIZ_INSTRUCTIONS, STUDIO_QUIZ_PROMPT_VERSION, studioQuizPrompt } from '../_shared/prompts/studioQuiz.ts'
import { StudioQuizAnswerSchema, StudioQuizRequestSchema, type StudioQuizQuestion, type StudioQuizRequest, type StudioQuizResponse } from '../_shared/schemas.ts'

/** The options in a random order, with the right answer's index moved along (models like putting it first). */
export function shuffleOptions(question: StudioQuizQuestion, random: () => number = Math.random): StudioQuizQuestion {
  const order = question.options.map((_, index) => index)
  for (let index = order.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[order[index], order[other]] = [order[other] as number, order[index] as number]
  }
  return {
    ...question,
    options: order.map((from) => question.options[from] ?? ''),
    correctOption: order.indexOf(question.correctOption),
  }
}

/**
 * A note → multiple-choice questions (Gemini, Fast: questions from a note need no deep thinking, and
 * Flash-Lite answers in seconds where the Smart model was often busy). The app saves them and the
 * student's answers.
 */
export const quizFeature: AiFeature<StudioQuizRequest, StudioQuizResponse> = {
  feature: 'studio-quiz',
  input: StudioQuizRequestSchema,
  async run({ input, userId, ai, cache }) {
    const cacheKey = input.videoId?.trim() ? `${input.videoId.trim()}:n${input.count}` : null
    if (cacheKey && cache) {
      const cached = await cache.get(cacheKey, 'quiz', STUDIO_QUIZ_PROMPT_VERSION).catch(() => null)
      if (cached) {
        try {
          const parsed = StudioQuizAnswerSchema.safeParse(JSON.parse(cached.content))
          if (parsed.success && parsed.data.questions.length > 0) {
            const questions = parsed.data.questions.slice(0, input.count).map((question) => shuffleOptions(question))
            return { questions, model: cached.model || 'cached', promptVersion: STUDIO_QUIZ_PROMPT_VERSION }
          }
        } catch {
          // Invalid cached payload falls through cleanly to fresh generation.
        }
      }
    }

    const { data, model } = await ai.generate({
      userId,
      feature: 'studio-quiz',
      tier: 'fast',
      schema: StudioQuizAnswerSchema,
      instructions: STUDIO_QUIZ_INSTRUCTIONS,
      prompt: studioQuizPrompt(input),
    })
    const normalized = data.questions.slice(0, input.count).map((question) => ({
      ...question,
      prompt: question.prompt.trim(),
      options: question.options.map((option) => option.trim()),
      explanation: question.explanation.trim(),
    }))
    if (cacheKey && cache && normalized.length > 0) {
      await cache
        .set({
          videoId: cacheKey,
          kind: 'quiz',
          promptVersion: STUDIO_QUIZ_PROMPT_VERSION,
          title: input.title,
          content: JSON.stringify({ questions: normalized }),
          model,
        })
        .catch(() => {})
    }
    const questions = normalized.map((question) => shuffleOptions(question))
    return { questions, model, promptVersion: STUDIO_QUIZ_PROMPT_VERSION }
  },
}
