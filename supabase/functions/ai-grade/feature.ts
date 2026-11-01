import type { AiFeature } from '../_shared/http.ts'
import { GRADE_PROMPT_VERSION, gradeInstructions, gradePrompt } from '../_shared/prompts/grade.ts'
import { gradeAnswerSchemaFor, GradeRequestSchema, type GradeRequest, type GradeResponse } from '../_shared/schemas.ts'

/** Marks a mock test's written answers (up to 15 in one request) against key points or a model answer. */
export const gradeFeature: AiFeature<GradeRequest, GradeResponse> = {
  feature: 'grade',
  input: GradeRequestSchema,
  async run({ input, userId, ai }) {
    const { data, model } = await ai.generate({
      userId,
      feature: 'grade',
      tier: 'fast',
      schema: gradeAnswerSchemaFor(input.items),
      instructions: gradeInstructions(),
      prompt: gradePrompt(input),
    })
    // Back in the order of the request, with marks in steps of 0.5.
    const byKey = new Map(data.grades.map((grade) => [grade.key, grade]))
    const grades = input.items.flatMap((item) => {
      const grade = byKey.get(item.key)
      return grade ? [{ ...grade, awarded: Math.min(item.marks, Math.round(grade.awarded * 2) / 2) }] : []
    })
    return { grades, model, promptVersion: GRADE_PROMPT_VERSION }
  },
}
