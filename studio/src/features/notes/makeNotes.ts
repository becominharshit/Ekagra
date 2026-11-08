import { MAX_FILE_BYTES, StudioNotesResponseSchema, type StudioNoteKind, type StudioNotesRequest } from '@shared/schemas.ts'
import { MIN_PDF_TEXT } from '@/features/academics/source'
import { callAiFunction } from '@/features/ai/aiClient'
import type { DataSource } from '@/lib/dataSource'
import { fileToSource } from '@/lib/files'
import { downloadMaterial, materialText, type Material } from '@studio/features/library/library'

// Making notes, a mind map or a revision sheet from a material: what Gemini reads (a YouTube link;
// text, also read from a PDF on the device; or a photo or scanned PDF), then studio-notes, which
// saves the note at once and fills it in in the background.

/** The most text the AI reads at once (the request's limit). */
export const TEXT_LIMIT = 60_000
/** Pages read from a PDF before the text is cut to TEXT_LIMIT. */
const PDF_PAGES = 120

/** As many whole pages as fit in `limit` characters, from `firstPage` on. `lastPage` is the last one used. */
export function textForNotes(pages: string[], firstPage: number, limit = TEXT_LIMIT): { text: string; lastPage: number } {
  const kept: string[] = []
  let length = 0
  for (const page of pages) {
    const piece = page.trim()
    // The first page always counts, cut if it alone is too long.
    if (kept.length > 0 && length + piece.length > limit) break
    kept.push(piece.slice(0, limit))
    length += piece.length + 2
  }
  return { text: kept.join('\n\n').slice(0, limit), lastPage: firstPage + Math.max(kept.length, 1) - 1 }
}

export interface NotesSource {
  source: StudioNotesRequest['source']
  /** For a PDF read as text: the pages used, e.g. "pages 1–24 of 300". */
  pages: { first: number; last: number; count: number } | null
}

export interface VideoRange {
  startSec?: number
  endSec?: number
}

/** What Gemini reads for this material. For a PDF, from `firstPage` on, as many pages as fit. */
export async function notesSource(source: DataSource, material: Material, firstPage = 1, range?: VideoRange): Promise<NotesSource> {
  if (material.kind === 'youtube') {
    if (!material.source_url) throw new Error("This video's link is missing. Delete it and add the video again.")
    const startSec = range?.startSec !== undefined && range.startSec > 0 ? Math.floor(range.startSec) : undefined
    const endSec = range?.endSec !== undefined && range.endSec > 0 ? Math.floor(range.endSec) : undefined
    if (startSec !== undefined && endSec !== undefined && endSec <= startSec) {
      throw new Error('The end time must be after the start time.')
    }
    return {
      source: {
        kind: 'youtube',
        url: material.source_url,
        ...(startSec !== undefined ? { startSec } : {}),
        ...(endSec !== undefined ? { endSec } : {}),
      },
      pages: null,
    }
  }
  if (material.kind === 'text') {
    const text = (await materialText(source, material.id)).trim()
    if (!text) throw new Error('This text is empty.')
    return { source: { kind: 'text', text: text.slice(0, TEXT_LIMIT) }, pages: null }
  }
  if (material.kind === 'image') {
    const photo = await downloadMaterial(source, material)
    return { source: { kind: 'file', file: await fileToSource(new File([photo], 'photo.jpg', { type: photo.type || 'image/jpeg' })) }, pages: null }
  }
  if (material.kind === 'pdf') {
    const file = await downloadMaterial(source, material)
    const { readPdfText } = await import('@/lib/pdf')
    const { pages, pageCount } = await readPdfText(await file.arrayBuffer(), PDF_PAGES, firstPage)
    if (pages.length === 0) throw new Error(`This PDF has ${pageCount} pages: start at page ${pageCount} or before.`)
    const { text, lastPage } = textForNotes(pages, firstPage)
    if (text.replace(/\s/g, '').length >= MIN_PDF_TEXT) return { source: { kind: 'text', text }, pages: { first: firstPage, last: lastPage, count: pageCount } }
    // Pictures of pages (a scan): the AI reads the file itself, if it's small enough to send.
    if (file.size > MAX_FILE_BYTES) {
      throw new Error("This PDF is scanned (pictures of pages) and too big for the AI to read. Add photos of the pages you need instead.")
    }
    return { source: { kind: 'file', file: await fileToSource(new File([file], 'scan.pdf', { type: 'application/pdf' })) }, pages: null }
  }
  throw new Error("Studio can't make notes from this kind of material yet.")
}

export interface MakeNotesInput {
  material: Material
  kind: StudioNoteKind
  subjectId: string
  firstPage?: number
  startSec?: number
  endSec?: number
  program?: string | null
  year?: number | null
}

/** Starts making a note and returns its id (the note says 'processing' until it's done). */
export async function makeNotes(source: DataSource, input: MakeNotesInput): Promise<string> {
  if (source.kind === 'demo') throw new Error("Studio's AI needs you to be signed in.")
  const { source: what } = await notesSource(source, input.material, input.firstPage, { startSec: input.startSec, endSec: input.endSec })
  const { noteId } = await callAiFunction(
    'studio-notes',
    {
      materialId: input.material.id,
      subjectId: input.subjectId,
      kind: input.kind,
      title: input.material.title.slice(0, 200),
      source: what,
      program: input.program ?? null,
      year: input.year ?? null,
    },
    StudioNotesResponseSchema,
  )
  return noteId
}
