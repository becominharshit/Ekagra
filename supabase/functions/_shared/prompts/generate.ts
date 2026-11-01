import type { GenerateRequest } from '../schemas.ts'

// Prompt for ai-generate (Fast tier): the lesson, check quiz and flashcards for one topic.
// Change the version when the wording changes.
export const GENERATE_PROMPT_VERSION = 'generate-v1'

const TONES: Record<NonNullable<GenerateRequest['mentorTone']>, string> = {
  strict: 'Be brief and direct.',
  balanced: 'Be clear and encouraging.',
  friendly: 'Be warm and encouraging.',
}

export function generateInstructions(request: GenerateRequest): string {
  const student = [request.year ? `in year ${request.year}` : null, request.program ? `of ${request.program}` : null].filter(Boolean)
  const lastSection =
    request.track === 'exam'
      ? '## How to write this in the exam: how a 5- and a 10-mark answer on this topic should be built (use the past questions if given)'
      : '## Using it in practice: a small real-world task where this skill helps'
  return `You are a patient university teacher. Write study material for ONE topic for a student${student.length > 0 ? ` ${student.join(' ')}` : ''}.

lessonMd: Markdown, 400–900 words, with these sections:
## Simple explanation: plain words first, then the proper terms; one analogy if it helps
## Key ideas: 3–6 bullet points
## Worked example: one example, step by step
## Common mistakes: 2–4 mistakes students make, and how to avoid them
${lastSection}

checkQuestions: 3–5 questions that check the lesson was understood (not just remembered word for word). Mix the types:
- "mcq": exactly 4 options, one right; correctOption = its index (0–3); answer = the text of the right option.
- "numerical": only if the topic has calculations; answer = only the number; tolerance = how far off an answer may be because of rounding.
- "short": answerable in 2–4 sentences; answer = a model answer; keyPoints = 2–4 points a good answer contains.
Every question has an explanation and a difficulty from 1 (easy) to 5 (hard).

flashcards: 5–15 cards about the key ideas, definitions and formulas. front = a short question, back = a short answer.

${TONES[request.mentorTone ?? 'balanced']} Never invent links or references. Answer only with JSON in the required format.`
}

export function generatePrompt(request: GenerateRequest): string {
  const lines = [
    `Subject: ${request.subjectName}`,
    request.unitTitle ? `Unit: ${request.unitTitle}` : null,
    `Topic: ${request.topicTitle}`,
    `Track: ${request.track === 'exam' ? 'exam (syllabus topic)' : 'skill (practical, beyond the exam)'}`,
    request.difficulty ? `Difficulty for this student: ${request.difficulty} of 5` : null,
    request.estMinutes ? `Study time planned: ${request.estMinutes} minutes` : null,
    request.prerequisites && request.prerequisites.length > 0 ? `Already learned: ${request.prerequisites.join('; ')}` : null,
  ]
  const past = request.pastQuestions ?? []
  if (past.length > 0) {
    lines.push('Past exam questions on this topic:')
    for (const question of past) {
      const about = [question.marks !== null ? `${question.marks} marks` : null, question.year !== null ? String(question.year) : null].filter(Boolean)
      lines.push(`- ${about.length > 0 ? `(${about.join(', ')}) ` : ''}${question.text}`)
    }
  }
  return lines.filter((line) => line !== null).join('\n')
}
