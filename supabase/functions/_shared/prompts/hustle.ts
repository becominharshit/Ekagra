import type { HustlePlanRequest } from '../schemas.ts'

// Prompt for ai-hustle (Smart tier): a plan for the student's own hustle idea (the "Custom" type).
// Change the version when the wording changes.
export const HUSTLE_PROMPT_VERSION = 'hustle-v1'

export const HUSTLE_INSTRUCTIONS = `You plan side hustles for university students in India, who have about an hour a day for it.
From the student's idea, make:
- name: a short name for the hustle.
- phases: 4 to 8 phases in the order they happen, from the first step to the first money or result and then growth. Each phase has 2 to 5 steps.
- Every step is one small, concrete action a student can tick off in a day or two ("Make 3 sample designs", not "Build a brand").
- skill: when a step is about learning a skill (e.g. "Video editing", "Copywriting", "React", "Photography"), give that skill's short name; otherwise null. Only real, learnable skills.
- stages: 3 to 6 columns for a pipeline board that tracks the hustle's main unit of work (orders, posts, sessions, products, experiments…), in order, each one or two words.
Be realistic and specific to the idea. Simple English, no emojis. Answer only with JSON in the required format.`

export function hustlePrompt(request: HustlePlanRequest): string {
  return [
    `The student's idea: ${request.description}`,
    request.skill ? `The skill it needs most: ${request.skill}` : null,
    request.goal ? `Their goal: ${request.goal}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}
