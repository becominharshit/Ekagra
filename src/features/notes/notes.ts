import { useQuery } from '@tanstack/react-query'
import { academicsKey } from '@/features/academics/subjects'
import { dbError, need, readAll, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Tables } from '@/types/database'

// Notes, mind maps and revision sheets from Ekagra Studio (App #2, in studio/), which uses the same
// database: signed in to both apps with the same account, Studio's notes show here under each
// subject. Ekagra only reads them; Studio makes and changes them. Studio needs sign-in, so in Demo
// Mode this device's notes table stays empty.

export type Note = Tables<'notes'>
export type NoteKind = 'notes' | 'mind_map' | 'revision_sheet'
/** A note in a list: everything but its (long) text. */
export type NoteSummary = Omit<Note, 'content'>

const KIND_LABEL: Record<NoteKind, string> = { notes: 'Notes', mind_map: 'Mind map', revision_sheet: 'Revision sheet' }
const SOURCE_LABEL: Record<string, string> = { manual: 'Written in Studio', material: 'From a material', youtube: 'From a YouTube video' }

export function noteKindLabel(kind: string): string {
  return kind in KIND_LABEL ? KIND_LABEL[kind as NoteKind] : 'Notes'
}

export function noteSourceLabel(source: string): string | null {
  return SOURCE_LABEL[source] ?? null
}

export interface NoteHeading {
  id: string
  text: string
}

/** Turns a heading's text into a clean HTML id for Table of Contents jump links. */
export function headingSlug(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[*_`~]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug ? `sec-${slug}` : 'sec-heading'
}

/** Extracts `## ` section headings from Markdown (ignoring fenced code blocks) for the Table of Contents jump bar. */
export function extractNoteHeadings(markdown: string): NoteHeading[] {
  const headings: NoteHeading[] = []
  const seen = new Set<string>()
  let inFence = false
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (/^(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const match = /^##\s+(.+)$/.exec(line)
    if (!match?.[1]) continue
    const text = match[1].replace(/\s+#+\s*$/, '').replace(/[*_`~]/g, '').trim()
    if (!text) continue
    const id = headingSlug(text)
    if (seen.has(id)) continue
    seen.add(id)
    headings.push({ id, text })
  }
  return headings
}

/** Every column but the (long) content; Ekagra Studio's lists use it too. */
export const NOTE_SUMMARY_COLUMNS = 'id, user_id, subject_id, topic_id, material_id, kind, title, source, status, error, model, prompt_version, created_at, updated_at'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const newestFirst = (a: NoteSummary, b: NoteSummary) => Date.parse(b.updated_at) - Date.parse(a.updated_at)

/** The subject's finished notes, the most recently changed first. */
export async function listSubjectNotes(source: DataSource, subjectId: string): Promise<NoteSummary[]> {
  if (source.kind === 'demo') {
    return demoDb
      .list('notes')
      .filter((note) => note.subject_id === subjectId && note.status === 'ready')
      .sort(newestFirst)
  }
  const { data, error } = await source.client
    .from('notes')
    .select(NOTE_SUMMARY_COLUMNS)
    .eq('user_id', source.userId)
    .eq('subject_id', subjectId)
    .eq('status', 'ready')
    .order('updated_at', { ascending: false })
  if (error) throw dbError(error)
  return data
}

/** Every finished note, of every subject, the most recently changed first (the Library lists them). */
export async function listNotes(source: DataSource): Promise<NoteSummary[]> {
  if (source.kind === 'demo') return demoDb.list('notes').filter((note) => note.status === 'ready').sort(newestFirst)
  return readAll((from, to) =>
    source.client.from('notes').select(NOTE_SUMMARY_COLUMNS).eq('user_id', source.userId).eq('status', 'ready').order('updated_at', { ascending: false }).range(from, to),
  )
}

/** One note with its text; null when there's no note with that id (or it belongs to someone else). */
export async function getNote(source: DataSource, id: string): Promise<Note | null> {
  if (!UUID.test(id)) return null
  if (source.kind === 'demo') return demoDb.get('notes', id)
  const { data, error } = await source.client.from('notes').select('*').eq('id', id).maybeSingle()
  if (error) throw dbError(error)
  return data
}

// Studio adds and changes notes from another app or tab, so these look again (when a minute-old
// answer would be stale) whenever the student comes back to Ekagra.
const FROM_STUDIO = { staleTime: 10_000, refetchOnWindowFocus: true } as const

export function useSubjectNotes(subjectId: string | undefined) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'notes', subjectId],
    queryFn: () => listSubjectNotes(need(source), subjectId ?? ''),
    enabled: source !== null && Boolean(subjectId),
    ...FROM_STUDIO,
  })
}

export function useNotes() {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'all-notes'],
    queryFn: () => listNotes(need(source)),
    enabled: source !== null,
    ...FROM_STUDIO,
  })
}

/** One note. While Studio is still making it, it's checked again every `pollMs` (Studio itself checks more often). */
export function useNote(noteId: string | undefined, pollMs = 15_000) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'note', noteId],
    queryFn: () => getNote(need(source), noteId ?? ''),
    enabled: source !== null && Boolean(noteId),
    ...FROM_STUDIO,
    refetchInterval: (query) => (query.state.data?.status === 'processing' ? pollMs : false),
  })
}

const SAMPLE_LECTURE_NOTE = [
  '## Overview',
  '- **0:00–15:00:** Relational algebra foundations and inner/outer joins.\n- **15:00–30:00:** Functional dependencies, Armstrong’s axioms, and BCNF decomposition.',
  '## Relational Joins & Selectivity (0:00)',
  '- An **inner join** ($R \\bowtie_{\\theta} S$) keeps only tuples from $R$ and $S$ that satisfy the join condition $\\theta$.\n- A **left outer join** keeps every tuple of $R$, padding unmatched attributes from $S$ with `NULL`.',
  '$$|R \\bowtie S| \\le |R| \\times |S|$$',
  '**Exam tip:** When a join attribute is a foreign key referencing a primary key with `NOT NULL`, the join size equals the child table size $|R|$.',
  '## Functional Dependencies & Closure (12:40)',
  '- A functional dependency $X \\to Y$ means any two tuples agreeing on attributes $X$ must also agree on $Y$.\n- To test whether $X$ is a **candidate key**, compute the attribute closure $X^+$ under the given FDs and check if $X^+$ contains all attributes of the relation.',
  '$$\\text{Reflexivity: } Y \\subseteq X \\implies X \\to Y \\qquad \\text{Transitivity: } X \\to Y,\\, Y \\to Z \\implies X \\to Z$$',
  '**Exam tip:** Any attribute that never appears on the right-hand side of any nontrivial FD must be part of every candidate key.',
  '## BCNF vs 3NF Decomposition (21:15)',
  '- A relation is in **BCNF** if for every nontrivial FD $X \\to Y$, $X$ is a superkey.\n- A relation is in **3NF** if for every nontrivial FD $X \\to Y$, either $X$ is a superkey or every attribute in $Y - X$ is a **prime attribute** (part of some candidate key).',
  '**Exam tip:** Every binary (2-attribute) relation is automatically in BCNF.',
  '## Key points',
  '- Compute $X^+$ first in every normalization exam question\n- BCNF guarantees lossless-join decomposition but may not preserve all dependencies\n- 3NF always allows both lossless-join and dependency-preserving decomposition',
].join('\n\n')

const SAMPLE_MIND_MAP = [
  '# Joins & Normalization',
  '## Relational Joins',
  '- Inner Join: matching rows only',
  '- Left/Right Outer Join: keeps unmatched rows with NULL',
  '- Natural Join: equates common columns',
  '## Keys & Closures',
  '- Superkey: uniquely identifies a row',
  '- Candidate Key: minimal superkey',
  '- Attribute Closure (X+): all columns determined by X',
  '## Normal Forms',
  '- 1NF: atomic values',
  '- 2NF: no partial dependency on a candidate key',
  '- 3NF: superkey on LHS or prime attribute on RHS',
  '- BCNF: superkey on LHS for every nontrivial FD',
].join('\n')

/** In Demo Mode: seeds one full lecture note and one mind map under the subject so the reader, Handwritten view, and PDF export can be tried immediately. */
export async function seedSampleNotes(source: DataSource, subjectId: string): Promise<Note[]> {
  if (source.kind !== 'demo') return []
  const existing = demoDb.list('notes').filter((note) => note.subject_id === subjectId && note.status === 'ready')
  if (existing.length > 0) return existing
  return demoDb.insert('notes', [
    {
      subject_id: subjectId,
      kind: 'notes',
      title: 'Sample: Joins, Closures & BCNF (0:00–30:00)',
      content: SAMPLE_LECTURE_NOTE,
      source: 'youtube',
      status: 'ready',
      model: 'gemini-3.5-flash-lite',
      prompt_version: 'studio-notes-v6',
    },
    {
      subject_id: subjectId,
      kind: 'mind_map',
      title: 'Sample: Joins & Normalization Mind Map',
      content: SAMPLE_MIND_MAP,
      source: 'youtube',
      status: 'ready',
      model: 'gemini-3.5-flash-lite',
      prompt_version: 'studio-notes-v6',
    },
  ])
}
