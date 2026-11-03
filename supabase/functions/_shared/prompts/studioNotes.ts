import type { ModelMessage } from 'ai'
import type { StudioNoteKind, StudioNotesRequest } from '../schemas.ts'
import { clockTime, type VideoPart } from '../youtube.ts'
import { withSource } from './source.ts'

// Prompt for studio-notes (Gemini): notes, a mind map or a revision sheet from one material (a
// YouTube video, text, or a photo or scanned PDF). A long video is watched in parts, then the
// parts are combined (studioCombine*). The Markdown must render in both apps
// (src/components/Markdown.tsx: no tables, no LaTeX), and a mind map must be an outline that
// src/features/notes/outline.ts can draw. Change the version when the wording changes.
export const STUDIO_NOTES_PROMPT_VERSION = 'studio-notes-v2'

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

/** One part of a long video: which one, out of how many. */
export type NumberedPart = VideoPart & { index: number; count: number }

/**
 * The material as the prompt's content: the video (by its link, seen at `fps` frames a second,
 * see lectureFps, and only `part` of it when given), the text, or the file.
 */
export function studioNotesPrompt(request: StudioNotesRequest, videoUrl: string | null, fps?: number, part?: NumberedPart): string | ModelMessage[] {
  const student = [request.program, request.year ? `year ${request.year}` : null].filter(Boolean).join(', ')
  const ask = [`The material is called "${request.title}".`, student ? `The student studies ${student}.` : null, 'Make it from this material.'].filter(Boolean).join(' ')
  if (videoUrl) {
    const which = part
      ? ` This is part ${part.index + 1} of ${part.count} of the video, from ${clockTime(part.start)} to ${clockTime(part.end)}: make it for this part only, and give times from the start of the whole video.`
      : ''
    const videoMetadata = { ...(fps ? { fps } : {}), ...(part ? { startOffset: `${part.start}s`, endOffset: `${part.end}s` } : {}) }
    return [
      {
        role: 'user',
        content: [
          { type: 'text', text: `${ask} It is a YouTube lecture video.${which}` },
          {
            type: 'file',
            data: new URL(videoUrl),
            mediaType: 'video/mp4',
            ...(Object.keys(videoMetadata).length > 0 ? { providerOptions: { google: { videoMetadata } } } : {}),
          },
        ],
      },
    ]
  }
  if (request.source.kind === 'text') return withSource(ask, request.source.text, undefined)
  if (request.source.kind === 'file') return withSource(ask, undefined, request.source.file)
  return ask
}

const KIND_NAME: Record<StudioNoteKind, string> = { notes: 'notes', mind_map: 'mind map', revision_sheet: 'revision sheet' }

/** For the last step of a long video: one note from the notes of its parts. */
export function studioCombineInstructions(kind: StudioNoteKind): string {
  const name = KIND_NAME[kind]
  return `${SHARED}

You get the ${name} made from each part of one long lecture video, in order. Combine them into one ${name} for the whole lecture, in this format:

${KIND[kind]}

Keep every definition, formula, example and step from the parts, with their times; remove only repetition (recaps, greetings). Use only what is in the parts. Answer only with JSON in the required format.`
}

export function studioCombinePrompt(title: string, parts: (VideoPart & { markdown: string })[]): string {
  const pieces = parts.map((part, index) => `Part ${index + 1}, ${clockTime(part.start)} to ${clockTime(part.end)}:\n<<<\n${part.markdown.trim()}\n>>>`)
  return [`The lecture is called "${title}". Here is what was made from each of its ${parts.length} parts.`, ...pieces].join('\n\n')
}
