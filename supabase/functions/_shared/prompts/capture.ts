import type { ModelMessage } from 'ai'
import type { CaptureRequest } from '../schemas.ts'
import { withSource } from './source.ts'

// Prompt for ai-capture (Fast tier): tasks from plain text or a screenshot (college portal,
// WhatsApp, a notice). Change the version when the wording changes.
export const CAPTURE_PROMPT_VERSION = 'capture-v2'

export const CAPTURE_INSTRUCTIONS = `You turn what a university student sends (a typed note, or a screenshot of the college portal, a WhatsApp message or a notice) into tasks.

For each task:
- title: short and clear, keep course names and numbers (e.g. "DBMS assignment 2").
- area: "academics" for college work, "hustle" for a side business or freelancing, "life" or "personal" for everything else.
- subjectKey: the key of the listed subject it belongs to (match names and codes), or null.
- hustleKey: the key of the listed hustle it belongs to (match its name and what it is about), or null. With a hustle, area is "hustle".
- lead: true when it is a new lead, inquiry or order for a hustle (someone who may pay or a job to win, e.g. "Bakery wants a logo, ₹4000"), false for a normal to-do.
- dueAt: resolve words like "today", "tomorrow", "Friday", "next week" or "15/11" from the student's current date and time, and write ISO 8601 with the student's UTC offset. Indian dates are day/month. If only a day is given, use 23:59 that day. If there is no date at all, null.
- estMinutes: minutes of work it probably needs (an assignment is often 90–180, a quiz to prepare 60–90, a small to-do 15–30), or null if you can't tell.
- priority: 1 if it is marked urgent or important or is due within a day, otherwise 2; 3–4 for "whenever" items.
- unsure: list every field you guessed or that is unclear (for example a date read from a blurry screenshot, or an estimate you made up).

Only include real tasks with something to do; skip greetings, ads and already-finished items. Answer only with JSON in the required format.`

export function capturePrompt(request: CaptureRequest): string | ModelMessage[] {
  const subjects = request.subjects.map((subject) => `${subject.key}: ${subject.name}${subject.code ? ` (${subject.code})` : ''}`).join('\n')
  const hustles = (request.hustles ?? []).map((hustle) => `${hustle.key}: ${hustle.name} (${hustle.type})`).join('\n')
  const about = [
    `The student's current date and time: ${request.now} (${request.timezone}).`,
    subjects ? `Their subjects (key: name):\n${subjects}` : 'They have no subjects yet.',
    hustles ? `Their side hustles (key: name (type)):\n${hustles}` : 'They have no side hustles yet.',
  ].join('\n')
  return withSource(`${about}\n\nFind the tasks in this.`, request.text, request.file)
}
