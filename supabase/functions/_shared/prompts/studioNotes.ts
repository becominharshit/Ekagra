import type { ModelMessage } from 'ai'
import type { StudioNoteKind, StudioNotesRequest } from '../schemas.ts'
import { clockTime, type VideoPart } from '../youtube.ts'
import { withSource } from './source.ts'

// Prompt for studio-notes (Gemini): notes, a mind map or a revision sheet from one material (a
// YouTube video, text, or a photo or scanned PDF). A long video is watched in parts: its notes are
// the parts' notes joined in order (studioNotesPartInstructions); a mind map or revision sheet of
// it is combined from the parts' (studioCombine*), or made from the notes already made from it
// (studioFromNotesPrompt). The Markdown must render in both apps (src/components/Markdown.tsx: no
// tables; formulas are LaTeX drawn by KaTeX), and a mind map must be an outline that
// src/features/notes/outline.ts can draw. Change the version when the wording changes.
export const STUDIO_NOTES_PROMPT_VERSION = 'studio-notes-v4'

const SHARED = `You make study material for a university student in India from what they give you: a lecture video, their notes, a textbook page, slides or a photo.

Rules for every answer:
- Use only what is in the material. Never invent facts, numbers, names or links; if part of it is unclear (a blurry photo, bad audio), say so in one line instead of guessing.
- Write in simple, clear English for a student who is learning this for the first time. Keep technical terms and names exactly as the material uses them. If the material is in Hindi or Hinglish, still write in English.
- Formulas: write them in LaTeX, with real symbols and never their names. A formula inside a sentence goes between $…$, like $i_d = \\varepsilon_0 \\frac{d\\Phi_E}{dt}$, $c = \\frac{1}{\\sqrt{\\mu_0 \\varepsilon_0}}$, $E = mc^2$. A longer formula or a derivation step gets a paragraph of its own: put $$ alone on one line, the formula on the next line, and $$ alone on the line after it. Keep the LaTeX simple: \\frac, \\sqrt, ^, _, and Greek letters (\\alpha \\beta \\theta \\lambda \\mu \\pi \\omega \\Phi \\Omega \\Delta). Never put a formula in backticks or plain text.
- Markdown without tables and without HTML. Use headings, bullet lists, numbered lists, **bold** for key terms, and \`code\` blocks for code.
- For a video: skip greetings, sponsor messages, "like and subscribe" and anything off-topic.
- title: a short title for what this covers (not "Notes" or "Mind map").`

/** How full notes cover the material: the same for a whole material and for one part of a long video. */
const NOTES_BODY = `- Follow the material's order with "## " headings for each topic. For a video, add where it starts in the heading, like "## Displacement current (12:40)". Use "### " headings for the parts of a long topic.
- Under each heading, explain everything the material teaches: every definition, idea, law, formula, derivation and example, with the reasons behind them. Use short paragraphs where an idea needs explaining, and bullets for lists of facts.
- Derivations and worked examples: every step on its own numbered line, with its formula.
- After a formula, say what each symbol means and its unit, when the material says so.
- What the teacher stresses, warns about or says comes in exams: a line starting with **Remember:** or **Exam tip:**.
- A diagram on the board or a slide: say in words what it shows.
- Don't shorten: a long lecture gets long notes, at least 700 words for every 10 minutes of a video (a 15-minute part: at least 1,000 words). Every heading needs several paragraphs or bullets, not one line. A student who missed it must be able to learn everything from them.`

const KIND: Record<StudioNoteKind, string> = {
  notes: `Make complete, detailed study notes (markdown):
- Start with a two or three line summary of what the material teaches.
${NOTES_BODY}
- End with "## Key points": 5 to 10 bullets to remember.`,
  mind_map: `Make a mind map as a Markdown outline (markdown), and nothing else. The app draws it as a flowchart, so keep it clear:
- The first line is one "# " heading: the central topic, in at most 6 words.
- Then 4 to 7 main branches as "## " headings, in the order the material teaches them.
- Under each branch, 2 to 5 "- " points; under a point, at most 4 sub-points indented by two spaces. At most three levels below the centre.
- Every label is a short phrase of at most 8 words (a key term, a fact or a formula), never a full sentence.
- A formula is a point of its own, like "- $c = \\frac{1}{\\sqrt{\\mu_0 \\varepsilon_0}}$". No text outside the outline.`,
  revision_sheet: `Make a one-page revision sheet for quick revision before an exam (markdown). It must fit on one printed page:
- "## Formulas" first: every formula in the material, one bullet each, like "- **Speed of light:** $c = \\frac{1}{\\sqrt{\\mu_0 \\varepsilon_0}}$: $\\mu_0$ = permeability, $\\varepsilon_0$ = permittivity of free space". Leave this section out only if the material has no formulas.
- "## Must know": definitions, laws, rules and key facts, one short bullet each.
- "## Compare" (only when it helps): differences between things that are easily confused, as bullets.
- "## Common mistakes": what students often get wrong.
- "## Likely questions": 3 to 5 exam questions this material could answer.
- Short and dense: one line per bullet, no long explanations.`,
}

export function studioNotesInstructions(kind: StudioNoteKind): string {
  return `${SHARED}\n\n${KIND[kind]}\n\nAnswer only with JSON in the required format.`
}

/** Full notes of one part of a long video (StudioNotePartAnswerSchema); studio-notes joins the parts in order. */
export function studioNotesPartInstructions(): string {
  return `${SHARED}

You make the notes of one part of a long lecture video. The parts' notes are joined, in order, into the notes of the whole lecture, so make complete, detailed notes of this part:
${NOTES_BODY}

Answer with:
- summary: two or three sentences on what this part teaches.
- markdown: the notes of this part, starting with its first "## " heading (no summary, title or key points in here).
- keyPoints: 3 to 6 short things to remember from this part.

Answer only with JSON in the required format.`
}

/** One part of a long video: which one, out of how many. */
export type NumberedPart = VideoPart & { index: number; count: number }

const words = (count: number) => (Math.round(count / 50) * 50).toLocaleString('en-US')

/** How long a part's notes should be: a number works better than "detailed" (75 to 100 words a minute). */
export function notesLength(part: VideoPart): string {
  const minutes = Math.max(1, Math.round((part.end - part.start) / 60))
  return `It is ${minutes} minutes long, so its notes should be about ${words(minutes * 75)} to ${words(minutes * 100)} words.`
}

/** The request in words: what the material is called and who the student is. */
function asking(request: StudioNotesRequest): string {
  const student = [request.program, request.year ? `year ${request.year}` : null].filter(Boolean).join(', ')
  return [`The material is called "${request.title}".`, student ? `The student studies ${student}.` : null, 'Make it from this material.'].filter(Boolean).join(' ')
}

/**
 * The material as the prompt's content: the video (by its link, seen at `fps` frames a second,
 * see lectureFps, and only `part` of it when given), the text, or the file.
 */
export function studioNotesPrompt(request: StudioNotesRequest, videoUrl: string | null, fps?: number, part?: NumberedPart): string | ModelMessage[] {
  const ask = asking(request)
  if (videoUrl) {
    const which = part
      ? ` This is part ${part.index + 1} of ${part.count} of the video, from ${clockTime(part.start)} to ${clockTime(part.end)}: make it for this part only, and give times from the start of the whole video.${request.kind === 'notes' ? ` ${notesLength(part)}` : ''}`
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

/** A mind map or revision sheet of a video, from the full notes already made from it: text only, so it takes seconds. */
export function studioFromNotesPrompt(request: StudioNotesRequest, notes: string): string | ModelMessage[] {
  return withSource(`${asking(request)} It is a YouTube lecture video; here are the full notes made from it, with the times where each topic starts.`, notes, undefined)
}

const KIND_NAME: Record<StudioNoteKind, string> = { notes: 'notes', mind_map: 'mind map', revision_sheet: 'revision sheet' }

/** For the last step of a mind map or revision sheet of a long video: one from the parts'. */
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
