import { create } from 'zustand'
import type { SourceDraft } from './source'

// A syllabus or past paper the Add inbox (features/inbox) recognised, handed to its import screen,
// which then starts with it filled in. Kept in memory only, for 10 minutes; the screen clears it
// once it has read it.

export type ImportKind = 'syllabus' | 'past_paper'

export interface ImportHandoff {
  subjectId: string
  kind: ImportKind
  source: SourceDraft
  /** Past papers: the year the AI found on it. */
  year: number | null
  at: number
}

const FRESH_MS = 10 * 60 * 1000

const useHandoffStore = create<{ handoff: ImportHandoff | null }>()(() => ({ handoff: null }))

export function handOverImport(handoff: Omit<ImportHandoff, 'at'>, now = Date.now()): void {
  useHandoffStore.setState({ handoff: { ...handoff, at: now } })
}

/** What the inbox handed to this subject's import screen, if anything (it stays until cleared). */
export function waitingImport(subjectId: string, kind: ImportKind, now = Date.now()): ImportHandoff | null {
  const { handoff } = useHandoffStore.getState()
  if (!handoff || handoff.subjectId !== subjectId || handoff.kind !== kind || now - handoff.at > FRESH_MS) return null
  return handoff
}

/** Called by the import screen after it has read the hand-off (reading is kept pure for React). */
export function clearImport(subjectId: string, kind: ImportKind): void {
  const { handoff } = useHandoffStore.getState()
  if (handoff?.subjectId === subjectId && handoff.kind === kind) useHandoffStore.setState({ handoff: null })
}
