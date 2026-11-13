import { useQuery } from '@tanstack/react-query'
import { academicsKey } from '@/features/academics/subjects'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'
import { LANGUAGE_SPECS, normalizeCodingLanguage, type CodingLanguage } from './languages'
import { problemTitle, readCodeAnswer, readCodeTests, starterRef, starterRows } from './problems'

// The Coding Lab's saved code (code_snippets) and its code problems (questions with type "code"),
// in Supabase or (Demo Mode) on the device.

export type Snippet = Tables<'code_snippets'>
export type CodeProblem = Tables<'questions'>

const recentFirst = (a: Snippet, b: Snippet) => Date.parse(b.updated_at) - Date.parse(a.updated_at)

/** Oldest first; starter problems (all added at the same moment) in their own order. */
function problemOrder(a: CodeProblem, b: CodeProblem): number {
  const time = Date.parse(a.created_at) - Date.parse(b.created_at)
  return time !== 0 ? time : (starterRef(a.source_ref)?.order ?? 0) - (starterRef(b.source_ref)?.order ?? 0)
}

export async function listSnippets(source: DataSource): Promise<Snippet[]> {
  if (source.kind === 'demo') return demoDb.list('code_snippets').sort(recentFirst)
  const { data, error } = await source.client
    .from('code_snippets')
    .select('*')
    .eq('user_id', source.userId)
    .order('updated_at', { ascending: false })
  if (error) throw dbError(error)
  return data
}

/** Code questions that have tests (past-paper code questions without tests aren't problems here). */
export async function listCodeProblems(source: DataSource): Promise<CodeProblem[]> {
  let rows: CodeProblem[]
  if (source.kind === 'demo') rows = demoDb.list('questions').filter((question) => question.type === 'code')
  else {
    const { data, error } = await source.client.from('questions').select('*').eq('user_id', source.userId).eq('type', 'code')
    if (error) throw dbError(error)
    rows = data
  }
  return rows.filter((question) => readCodeTests(question.tests).length > 0).sort(problemOrder)
}

/** Adds the app's starter problems (those not added yet). Returns how many were added. */
export async function addStarterProblems(source: DataSource): Promise<number> {
  const existing = await listCodeProblems(source)
  const rows = starterRows(new Set(existing.flatMap((problem) => starterRef(problem.source_ref)?.key ?? [])))
  if (rows.length === 0) return 0
  if (source.kind === 'demo') demoDb.insert('questions', rows)
  else {
    const { error } = await source.client.from('questions').insert(rows)
    if (error) throw dbError(error)
  }
  return rows.length
}

export async function createSnippet(source: DataSource, values: TablesInsert<'code_snippets'>): Promise<Snippet> {
  const normalizedValues: TablesInsert<'code_snippets'> = {
    ...values,
    language: normalizeCodingLanguage(values.language),
  }
  if (source.kind === 'demo') {
    const [row] = demoDb.insert('code_snippets', [normalizedValues])
    if (!row) throw new Error('The file was not saved.')
    return row
  }
  const { data, error } = await source.client.from('code_snippets').insert(normalizedValues).select().single()
  if (error) throw dbError(error)
  return data
}

export async function updateSnippet(source: DataSource, { id, patch }: { id: string; patch: TablesUpdate<'code_snippets'> }): Promise<void> {
  const normalizedPatch: TablesUpdate<'code_snippets'> =
    patch.language !== undefined ? { ...patch, language: normalizeCodingLanguage(patch.language) } : patch
  if (source.kind === 'demo') {
    demoDb.update('code_snippets', id, normalizedPatch)
    return
  }
  const { error } = await source.client.from('code_snippets').update(normalizedPatch).eq('id', id)
  if (error) throw dbError(error)
}

export async function deleteSnippet(source: DataSource, id: string): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.remove('code_snippets', [id])
    return
  }
  const { error } = await source.client.from('code_snippets').delete().eq('id', id)
  if (error) throw dbError(error)
}

/** A new free file to try things out in the chosen language (defaults to Python). */
export function newScratchFile(source: DataSource, language: CodingLanguage | string = 'python'): Promise<Snippet> {
  const normalized = normalizeCodingLanguage(language)
  return createSnippet(source, {
    title: 'Untitled',
    language: normalized,
    code: LANGUAGE_SPECS[normalized].defaultCode,
  })
}

/** The student's file for a problem: the existing one, or a new one with the starter code. */
export async function openProblem(source: DataSource, problem: CodeProblem): Promise<Snippet> {
  const existing = (await listSnippets(source)).find((snippet) => snippet.question_id === problem.id)
  if (existing) return existing
  return createSnippet(source, {
    title: problemTitle(problem.prompt),
    code: readCodeAnswer(problem.answer)?.starter ?? '',
    question_id: problem.id,
    topic_id: problem.topic_id,
  })
}

export function useSnippets() {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'snippets'],
    queryFn: () => listSnippets(need(source)),
    enabled: source !== null,
  })
}

export function useCodeProblems() {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'code-problems'],
    queryFn: () => listCodeProblems(need(source)),
    enabled: source !== null,
  })
}
