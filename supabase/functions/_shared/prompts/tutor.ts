import type { AnchorAction, TutorRequest } from '../schemas.ts'

// Prompt for ai-tutor (Fast tier): 1-click AI Anchors and "Ask about this page".
// Change the version when the wording changes.
export const TUTOR_PROMPT_VERSION = 'tutor-v1'

const TASKS: Record<AnchorAction, string> = {
  explain: 'Explain the selected text so the student really understands it. Use the page for context. Add a short analogy if it helps.',
  simplify: 'Rewrite the selected text in simpler words, as you would for a first-year student. Keep the meaning; drop nothing important.',
  example: 'Give one or two concrete, worked examples of the idea in the selected text, step by step.',
  flashcards:
    'Make 3 to 5 flashcards from the selected text: front = a short question, back = a short answer. In answerMd, write one line saying what the cards cover.',
  ask: "Answer the student's question using this page. If the page doesn't contain the answer, start with \"Not from this page:\" and answer briefly from general knowledge.",
}

const TONES: Record<NonNullable<TutorRequest['mentorTone']>, string> = {
  strict: 'Be brief and direct.',
  balanced: 'Be clear and encouraging.',
  friendly: 'Be warm and encouraging.',
}

export function tutorInstructions(request: TutorRequest): string {
  const student = [request.year ? `in year ${request.year}` : null, request.program ? `of ${request.program}` : null].filter(Boolean)
  return [
    `You are a patient university tutor. A student${student.length > 0 ? ` ${student.join(' ')}` : ''} is reading page ${request.pageNumber} of their course material.`,
    TASKS[request.action],
    `Write Markdown: short paragraphs, lists, **bold** for key terms. When you use the page, cite it as [p. ${request.pageNumber}]. Never invent links.`,
    TONES[request.mentorTone ?? 'balanced'],
    request.action === 'flashcards' ? '' : 'Return an empty flashcards list.',
    'Answer only with JSON in the required format.',
  ]
    .filter(Boolean)
    .join('\n')
}

export function tutorPrompt(request: TutorRequest): string {
  const source = `"${request.materialTitle}"${request.subjectName ? ` (${request.subjectName})` : ''}`
  const parts = [`Page ${request.pageNumber} of ${source}:\n<<<\n${request.pageText.trim() || '(this page has no text)'}\n>>>`]
  if (request.selectedText?.trim()) parts.push(`Selected text:\n<<<\n${request.selectedText.trim()}\n>>>`)
  if (request.action === 'ask' && request.question) parts.push(`Question: ${request.question.trim()}`)
  return parts.join('\n\n')
}
