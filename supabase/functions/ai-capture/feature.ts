import type { AiFeature } from '../_shared/http.ts'
import { CAPTURE_INSTRUCTIONS, CAPTURE_PROMPT_VERSION, capturePrompt } from '../_shared/prompts/capture.ts'
import { CaptureAnswerSchema, CaptureRequestSchema, type CaptureRequest, type CaptureResponse } from '../_shared/schemas.ts'

/** Text or a screenshot → tasks for the confirm sheet (nothing is saved here). */
export const captureFeature: AiFeature<CaptureRequest, CaptureResponse> = {
  feature: 'capture',
  input: CaptureRequestSchema,
  async run({ input, userId, ai }) {
    const { data, model } = await ai.generate({
      userId,
      feature: 'capture',
      tier: 'fast',
      schema: CaptureAnswerSchema,
      instructions: CAPTURE_INSTRUCTIONS,
      prompt: capturePrompt(input),
    })
    // Only keys from the list count as subjects.
    const keys = new Set(input.subjects.map((subject) => subject.key))
    const tasks = data.tasks.map((task) => ({ ...task, subjectKey: task.subjectKey && keys.has(task.subjectKey) ? task.subjectKey : null }))
    return { tasks, model, promptVersion: CAPTURE_PROMPT_VERSION }
  },
}
