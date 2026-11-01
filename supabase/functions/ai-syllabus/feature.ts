import type { AiFeature } from '../_shared/http.ts'
import { SYLLABUS_INSTRUCTIONS, syllabusPrompt } from '../_shared/prompts/syllabus.ts'
import { SyllabusRequestSchema, TopicTreeSchema, type SyllabusRequest, type TopicTree } from '../_shared/schemas.ts'

/** Syllabus (text, scanned PDF or photo) → units and topics on two tracks (exam and skill). */
export const syllabusFeature: AiFeature<SyllabusRequest, TopicTree> = {
  feature: 'syllabus',
  input: SyllabusRequestSchema,
  async run({ input, userId, ai }) {
    const { data } = await ai.generate({
      userId,
      feature: 'syllabus',
      tier: 'smart',
      schema: TopicTreeSchema,
      instructions: SYLLABUS_INSTRUCTIONS,
      prompt: syllabusPrompt(input),
    })
    return data
  },
}
