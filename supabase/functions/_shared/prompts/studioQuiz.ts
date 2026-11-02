import type { StudioQuizRequest } from '../schemas.ts'

// Prompt for studio-quiz (Gemini, Smart): multiple-choice questions from one of the student's notes.
// The app shuffles the options afterwards, so the right one isn't always first. Change the version
// when the wording changes.
export const STUDIO_QUIZ_PROMPT_VERSION = 'studio-quiz-v1'

export const STUDIO_QUIZ_INSTRUCTIONS = `You write multiple-choice questions that test whether a university student in India understood their study notes.

For each question:
- prompt: one clear question about one idea from the notes. Ask about understanding and use (why, which one, what happens if, which example), not only definitions word for word.
- options: exactly four, all different, about the same length. One is right; the other three are believable mistakes a student might make (common misunderstandings), not jokes. Never "all of the above" or "none of the above".
- correctOption: the index (0 to 3) of the right option.
- explanation: one or two sentences on why it is right, and if useful why a tempting wrong option is wrong.
- difficulty: 1 to 5. Mix them: mostly 2 and 3, some 1 and 4.

Use only what is in the notes; never test facts that aren't there. Cover different parts of the notes rather than one part many times. Write formulas in plain text (for example F = m × a), no LaTeX. Answer only with JSON in the required format.`

export function studioQuizPrompt(request: StudioQuizRequest): string {
  const student = [request.program, request.year ? `year ${request.year}` : null].filter(Boolean).join(', ')
  return [
    `Write ${request.count} questions about these notes, called "${request.title}".`,
    student ? `The student studies ${student}.` : null,
    `<<<\n${request.text}\n>>>`,
  ]
    .filter(Boolean)
    .join('\n\n')
}
