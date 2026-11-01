import type { SourceFile } from '@shared/schemas.ts'

/** What the student gives the AI: text (typed, pasted or read from a PDF) or a file it reads itself. */
export interface SourceDraft {
  kind: 'text' | 'pdf' | 'photo'
  text: string
  file: SourceFile | null
  /** What happened with the chosen file, in plain words. */
  note: string | null
}

export const EMPTY_SOURCE: SourceDraft = { kind: 'text', text: '', file: null, note: null }

export function sourceReady(source: SourceDraft): boolean {
  return source.text.trim().length > 0 || source.file !== null
}
