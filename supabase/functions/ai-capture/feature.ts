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
    // Only keys from the lists count as subjects and hustles; a lead needs a hustle.
    const subjectKeys = new Set(input.subjects.map((subject) => subject.key))
    const hustleKeys = new Set((input.hustles ?? []).map((hustle) => hustle.key))
    const tasks = data.tasks.map((task) => {
      const hustleKey = task.hustleKey && hustleKeys.has(task.hustleKey) ? task.hustleKey : null
      return {
        ...task,
        subjectKey: task.subjectKey && subjectKeys.has(task.subjectKey) ? task.subjectKey : null,
        hustleKey,
        lead: task.lead && hustleKey !== null,
      }
    })
    return { tasks, model, promptVersion: CAPTURE_PROMPT_VERSION }
  },
}
