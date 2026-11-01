import type { ReviewRequest } from '../schemas.ts'

// Prompt for ai-review (Smart tier): the Sunday review, 3 insights and up to 3 changes the app can
// apply in one tap. Change the version when the wording changes.
export const REVIEW_PROMPT_VERSION = 'review-v1'

const TONES: Record<ReviewRequest['mentorTone'], string> = {
  strict: 'Be brief and direct.',
  balanced: 'Be clear and encouraging.',
  friendly: 'Be warm and encouraging.',
}

export function reviewInstructions(request: ReviewRequest): string {
  return `You are a study mentor doing a university student's 5-minute weekly review. From the week's numbers (JSON), write:
1. Exactly 3 insights: one sentence each (at most 25 words), specific and with numbers from the data, e.g. "Your answers were 20% more accurate in the mornings than at night." Include at least one thing that went well when there is one. Never invent numbers.
2. Up to 3 changes for next week, only of these types (fill the fields each needs, set the others to null):
- move_subject_to_window: subjectKey of a course + window (morning, afternoon, evening, night). Its study blocks go there first.
- shift_budget: from + to (academics, hustle, life) + value = points to move (5-20).
- set_buffer: value = % of free time left unplanned (5-30). For many missed blocks.
- set_review_cap: value = minutes of flashcard and mistake reviews a day (10-90).
- set_new_cards: value = new flashcards a day (0-50). Fewer when retention is low.
- set_block_length: value = longest study block in minutes (25-60). Shorter when blocks often end early.
- set_peak_window: window for the best focus hours (hard topics go there).
- set_revision_days: value = days before each exam that topics should be finished (3-30).
- block_apps_in_study: block distracting apps in every study block (when distractions are high).
- challenge_metric: metric for next week's challenge (memory, learning_speed, processing_speed, problem_solving); only one that has a value this week.
- set_skill_minutes: subjectKey of a skill course + value = minutes a week (30-600).
Each change needs a reason from the numbers. Don't suggest what is already set (see "settings"). Pick the changes that would help most; fewer is fine when the week went well or there is little data.
Accuracy shares are 0-1; minutes are minutes. Use the subjects' names in the text, their keys only in subjectKey. No greetings, emojis or markdown. Simple English.
${TONES[request.mentorTone]} Answer only with JSON in the required format.`
}

export function reviewPrompt(request: ReviewRequest): string {
  return [
    `Week starting ${request.weekStart}.`,
    `Numbers: ${JSON.stringify(request.stats)}`,
    `Settings now: ${JSON.stringify(request.settings)}`,
    request.challenge
      ? `This week's challenge: ${request.challenge.metric}, target ${request.challenge.target} (${request.challenge.onTarget ? 'on target so far' : 'not on target so far'}).`
      : 'No weekly challenge this week.',
  ].join('\n')
}
