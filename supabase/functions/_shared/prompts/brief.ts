import type { BriefRequest } from '../schemas.ts'

// Prompt for ai-brief (Fast tier): the morning brief, 3 short lines about today.
// Change the version when the wording changes.
export const BRIEF_PROMPT_VERSION = 'brief-v1'

const TONES: Record<NonNullable<BriefRequest['mentorTone']>, string> = {
  strict: 'Be brief and direct.',
  balanced: 'Be clear and encouraging.',
  friendly: 'Be warm and encouraging.',
}

export function briefInstructions(request: BriefRequest): string {
  return `You are a study mentor for a university student. Write their morning brief: exactly 3 short lines (at most 20 words each) about what matters today and why.
- Line 1: the main focus of today: the most important block or deadline, with its time.
- Line 2: what's coming up (deadlines or a near exam) and how today's plan helps with it.
- Line 3: one practical tip for today, from their last check-in, the reviews waiting, or the plan.
If it is a minimum day or the Burnout Guard is on, be gentle: a lighter day is the right call.
Only use facts from the data: never invent tasks, times or numbers. Keep the student's titles. No greetings, emojis or markdown. Simple English.
${TONES[request.mentorTone ?? 'balanced']} Answer only with JSON in the required format.`
}

export function briefPrompt(request: BriefRequest): string {
  const blocks = request.blocks.map(
    (block) => `- ${block.start}–${block.end} ${block.mode}: ${block.title}${block.subject ? ` (${block.subject})` : ''}${block.status === 'planned' ? '' : ` [${block.status}]`}`,
  )
  const deadlines = request.deadlines.map((task) => `- ${task.title}${task.subject ? ` (${task.subject})` : ''}: ${task.due}`)
  const exams = request.exams.map((exam) => `${exam.subject} in ${exam.inDays} days`)
  const checkIn = request.lastCheckIn
  const lines = [
    `Today is ${request.day}.`,
    request.minimumDay ? 'They pressed "I crashed": today is a minimum day (only the essentials).' : null,
    request.burnoutGuard ? 'The Burnout Guard is on: their last check-ins had low energy, so today is 30% lighter.' : null,
    blocks.length > 0 ? `Today's plan:\n${blocks.join('\n')}` : 'Nothing is planned today.',
    deadlines.length > 0 ? `Deadlines:\n${deadlines.join('\n')}` : 'No deadlines in the next 7 days.',
    exams.length > 0 ? `Exams: ${exams.join(', ')}.` : null,
    `Reviews waiting: ${request.reviews.flashcards} flashcards, ${request.reviews.mistakes} mistakes.`,
    checkIn
      ? `Last check-in (${checkIn.daysAgo === 0 ? 'today' : checkIn.daysAgo === 1 ? 'yesterday' : `${checkIn.daysAgo} days ago`}): energy ${checkIn.energy}/5, mood ${checkIn.mood}/5${checkIn.topDistraction ? `, biggest distraction: ${checkIn.topDistraction}` : ''}.`
      : 'No check-in yet.',
  ]
  return lines.filter(Boolean).join('\n')
}
