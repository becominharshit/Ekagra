import type { ModelMessage } from 'ai'
import type { StudioNoteKind, StudioNotesRequest } from '../schemas.ts'
import { withSource } from './source.ts'

// Prompt for studio-notes (Gemini): notes, a mind map or a revision sheet from one material (a
// YouTube video, text, or a photo or scanned PDF). The Markdown must render in both apps
// (src/components/Markdown.tsx: no tables, no LaTeX), and a mind map must be an outline that
// src/features/notes/outline.ts can draw. Change the version when the wording changes.
export const STUDIO_NOTES_PROMPT_VERSION = 'studio-notes-v1'

const SHARED = `You make study material for a university student in India from what they give you: a lecture video, their notes, a textbook page, slides or a photo.

Rules for every answer:
- Use only what is in the material. Never invent facts, numbers, names or links; if part of it is unclear (a blurry photo, bad audio), say so in one line instead of guessing.
- Write in simple, clear English for a student who is learning this for the first time. Keep technical terms, names and formulas exactly as the material uses them. If the material is in Hindi or Hinglish, still write in English.
- Write formulas in plain text or inside \`backticks\` (for example \`F = m × a\`, \`O(n log n)\`). No LaTeX, no $…$.
- Markdown without tables and without HTML. Use headings, bullet lists, numbered lists, **bold** for key terms, and \`code\` blocks for code.
- For a video: skip greetings, sponsor messages, "like and subscribe" and anything off-topic.
- title: a short title for what this covers (not "Notes" or "Mind map").`

const KIND: Record<StudioNoteKind, string> = {
  notes: `Make full study notes (markdown):
- Start with a two or three line summary of what the material teaches.
- Then follow the material's order with ## headings for each part. For a video, add where it starts in the heading, like "## Joins (12:40)".
- Under each heading: bullet points with the ideas, definitions, steps and examples, and the reasons behind them; worked examples step by step.
- End with "## Key points": 5 to 10 bullets to remember.`,
  mind_map: `Make a mind map as a Markdown outline (markdown), and nothing else:
- The first line is one "# " heading: the central idea.
- Then 4 to 8 main branches as "## " headings.
- Under each branch, "- " bullets for the details, nested with two spaces for sub-points, at most three levels deep.
- Every point is a short phrase (at most 10 words), not a sentence or paragraph. No text outside the outline.`,
  revision_sheet: `Make a one-page revision sheet for the night before the exam (markdown):
- "## Must know": the definitions, formulas, rules and key facts, one short bullet each.
- "## Compare" (only when it helps): differences between things that are easily confused, as bullets.
- "## Common mistakes": what students often get wrong.
- "## Likely questions": 3 to 5 exam questions this material could answer.
- Short and dense: no long explanations.`,
}

export function studioNotesInstructions(kind: StudioNoteKind): string {
  return `${SHARED}\n\n${KIND[kind]}\n\nAnswer only with JSON in the required format.`
}

/**
 * The material as the prompt's content: the video (by its link, seen at `fps` frames a second,
 * see lectureFps), the text, or the file.
 */
export function studioNotesPrompt(request: StudioNotesRequest, videoUrl: string | null, fps?: number): string | ModelMessage[] {
  const student = [request.program, request.year ? `year ${request.year}` : null].filter(Boolean).join(', ')
  const ask = [`The material is called "${request.title}".`, student ? `The student studies ${student}.` : null, 'Make it from this material.'].filter(Boolean).join(' ')
  if (videoUrl) {
    return [
      {
        role: 'user',
        content: [
          { type: 'text', text: `${ask} It is a YouTube lecture video.` },
          {
            type: 'file',
            data: new URL(videoUrl),
            mediaType: 'video/mp4',
            ...(fps ? { providerOptions: { google: { videoMetadata: { fps } } } } : {}),
          },
        ],
      },
    ]
  }
  if (request.source.kind === 'text') return withSource(ask, request.source.text, undefined)
  if (request.source.kind === 'file') return withSource(ask, undefined, request.source.file)
  return ask
}
