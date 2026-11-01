import type { AiFeature } from '../_shared/http.ts'
import { PAPERS_INSTRUCTIONS, PAPERS_PROMPT_VERSION, papersPrompt } from '../_shared/prompts/papers.ts'
import { PaperAnalysisSchema, PaperRequestSchema, type PaperAnswer, type PaperRequest } from '../_shared/schemas.ts'

/** Past paper (text, scanned PDF or photo) → its questions, each matched to a topic key. */
export const papersFeature: AiFeature<PaperRequest, PaperAnswer> = {
  feature: 'papers',
  input: PaperRequestSchema,
  async run({ input, userId, ai }) {
    const { data } = await ai.generate({
      userId,
      feature: 'papers',
      tier: 'smart',
      schema: PaperAnalysisSchema,
      instructions: PAPERS_INSTRUCTIONS,
      prompt: papersPrompt(input),
    })
    // Only keys from the list count; anything else means "no matching topic".
    const keys = new Set(input.topics.map((topic) => topic.key))
    const questions = data.questions.map((question) => ({
      ...question,
      topicKey: question.topicKey && keys.has(question.topicKey) ? question.topicKey : null,
    }))
    return { ...data, questions, promptVersion: PAPERS_PROMPT_VERSION }
  },
}
