import type { AiFeature } from '../_shared/http.ts'
import { INBOX_INSTRUCTIONS, INBOX_PROMPT_VERSION, inboxPrompt } from '../_shared/prompts/inbox.ts'
import { InboxAnswerSchema, InboxRequestSchema, type InboxRequest, type InboxResponse } from '../_shared/schemas.ts'

/** "09:00" from "9:00" or "09:00"; the answer's shape already checked it is a time of day. */
const clock = (time: string) => time.padStart(5, '0')

/** An upload → what it is, its subject and (timetables) the weekly classes, for the student to confirm. Nothing is saved here. */
export const inboxFeature: AiFeature<InboxRequest, InboxResponse> = {
  feature: 'inbox',
  input: InboxRequestSchema,
  async run({ input, userId, ai }) {
    const { data, model } = await ai.generate({
      userId,
      feature: 'inbox',
      tier: 'fast',
      schema: InboxAnswerSchema,
      instructions: INBOX_INSTRUCTIONS,
      prompt: inboxPrompt(input),
    })
    // Only keys from the list count as subjects. A new subject only makes sense for something
    // that belongs to one course, and only when no listed subject fits.
    const keys = new Set(input.subjects.map((subject) => subject.key))
    const known = (key: string | null) => (key && keys.has(key) ? key : null)
    const subjectKey = data.kind === 'timetable' ? null : known(data.subjectKey)
    const ownsCourse = data.kind === 'syllabus' || data.kind === 'past_paper' || data.kind === 'study_material'
    const newSubject = ownsCourse && subjectKey === null ? data.newSubject?.trim() || null : null
    // A class must end after it starts, on at least one day.
    const classes =
      data.kind === 'timetable'
        ? data.classes.flatMap((item) => {
            const start = clock(item.start)
            const end = clock(item.end)
            const days = [...new Set(item.days)].sort((a, b) => a - b)
            const subject = item.subject.trim()
            return end > start && days.length > 0 && subject ? [{ subject, subjectKey: known(item.subjectKey), days, start, end }] : []
          })
        : []
    return {
      kind: data.kind,
      title: data.title.trim(),
      summary: data.summary.trim(),
      subjectKey,
      newSubject,
      year: data.kind === 'past_paper' ? data.year : null,
      classes,
      model,
      promptVersion: INBOX_PROMPT_VERSION,
    }
  },
}
