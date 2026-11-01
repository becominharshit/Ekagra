import type { ModelMessage } from 'ai'
import type { SyllabusRequest } from '../schemas.ts'
import { withSource } from './source.ts'

// Prompt for ai-syllabus (Smart tier). Change the version when the wording changes.
export const SYLLABUS_PROMPT_VERSION = 'syllabus-v1'

export const SYLLABUS_INSTRUCTIONS = `You turn a university syllabus into a study roadmap for one student.

Rules:
- Keep the university's own wording for unit and topic titles. Do not invent syllabus topics.
- Split the syllabus into learnable topics of 30–120 minutes each: split big topics, merge tiny ones.
- estMinutes: minutes a typical student of this program and year needs to learn the topic.
- difficulty: 1 (easy) to 5 (hard) for that student.
- examWeight: 0–1, how important the topic probably is in the exam. Topics with more teaching hours or marks in the syllabus weigh more.
- track: "exam" for every syllabus topic. Then add at most 5 optional "skill" topics in a last unit called "Skill track": practical things that make the subject useful in real work (modern tools, small projects). Skill topics have examWeight 0.
- key: a short unique id per topic, like "u1t1". prerequisites: keys of topics that must be learned first, only keys from your own list, and never in a circle.
- Answer only with JSON in the required format.`

export function syllabusPrompt(request: SyllabusRequest): string | ModelMessage[] {
  const about = [
    `Subject: ${request.subjectName}`,
    request.program ? `Program: ${request.program}` : null,
    request.year ? `Year of study: ${request.year}` : null,
    request.examDate ? `Exam date: ${request.examDate}` : null,
  ].filter((line) => line !== null)
  return withSource(`${about.join('\n')}\n\nMake the roadmap from this syllabus.`, request.text, request.file)
}
