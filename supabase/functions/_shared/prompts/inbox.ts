import type { ModelMessage } from 'ai'
import type { InboxRequest } from '../schemas.ts'
import { withSource } from './source.ts'

// Prompt for ai-inbox (Fast tier): what a student added (a file name with its text, a photo or a
// scanned PDF), which subject it belongs to and, for a timetable, its weekly classes.
// Change the version when the wording changes.
export const INBOX_PROMPT_VERSION = 'inbox-v1'

export const INBOX_INSTRUCTIONS = `You sort what a university student in India adds to their study planner: a file name with the file's text, a photo, a scanned PDF or typed text.

kind, what it is:
- "syllabus": the units and topics of one course (often with credits, course outcomes, "Unit I", textbooks).
- "timetable": the weekly class schedule (days, periods or times, course names).
- "past_paper": an exam question paper (questions with marks, "Answer any five", maximum marks, time allowed).
- "study_material": anything to learn from: notes, slides, a textbook chapter, a lab manual, a question bank, solved examples.
- "task": something to do by a date: an assignment or submission notice, a fee or form deadline, an exam date notice, a message asking for something.
- "other": none of these (a receipt, a selfie, an empty page).

Then:
- title: a short name, e.g. "DBMS syllabus", "Semester 3 timetable", "DBMS end-semester paper 2024", "Unit 3 notes: SQL joins".
- summary: one plain sentence on what it is.
- subjectKey: the key of the listed subject it belongs to (match names, codes and short forms, e.g. DBMS = Database Management Systems), or null. Always null for a timetable, which covers many subjects.
- newSubject: when it clearly belongs to one course that is not in the list (a syllabus, past paper or study material), that course's name; otherwise null.
- year: for a past paper, the exam year when the paper shows it; otherwise null.
- classes: only for a timetable, every weekly class: subject as written, subjectKey (matched like above) or null, days (0 = Sunday, 1 = Monday … 6 = Saturday; a class at the same time on several days lists them all), start and end as 24-hour HH:MM (1:30 PM is 13:30). Turn period numbers into times only when the timetable gives the period times. Leave out breaks, lunch and free periods. For anything else, an empty list.

Never guess what you can't read: leave out a class whose day or time is unclear. Answer only with JSON in the required format.`

export function inboxPrompt(request: InboxRequest): string | ModelMessage[] {
  const subjects = request.subjects.map((subject) => `${subject.key}: ${subject.name}${subject.code ? ` (${subject.code})` : ''}`).join('\n')
  const about = [
    request.fileName ? `File name: ${request.fileName}` : 'The student typed or pasted this text.',
    request.pageCount ? `Pages: ${request.pageCount}` : null,
    subjects ? `Their subjects (key: name):\n${subjects}` : 'They have no subjects yet.',
  ]
    .filter(Boolean)
    .join('\n')
  return withSource(`${about}\n\nWhat is this, and where does it belong?`, request.text, request.file)
}
