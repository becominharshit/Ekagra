import { useQuery } from '@tanstack/react-query'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Tables } from '@/types/database'
import { questionRows, type Question, type QuestionDraft } from './pastPapers'
import { loadPaperQuestions, refreshPriorities } from './roadmap'
import { academicsKey } from './subjects'

// Past papers and their questions, saved in Supabase or (Demo Mode) on the device.
// Saving or deleting one updates the subject's topic priorities.

export type PastPaper = Tables<'past_papers'>

export async function loadPapers(source: DataSource, subjectId: string): Promise<{ papers: PastPaper[]; questions: Question[] }> {
  const questions = await loadPaperQuestions(source, subjectId)
  if (source.kind === 'demo') {
    return { papers: demoDb.list('past_papers').filter((paper) => paper.subject_id === subjectId), questions }
  }
  const { data, error } = await source.client
    .from('past_papers')
    .select('*')
    .eq('user_id', source.userId)
    .eq('subject_id', subjectId)
    .order('year', { ascending: false, nullsFirst: false })
  if (error) throw dbError(error)
  return { papers: data, questions }
}

export interface NewPaper {
  subjectId: string
  year: number | null
  examType: string | null
  questions: QuestionDraft[]
  promptVersion: string | null
}

export async function savePaper(source: DataSource, paper: NewPaper): Promise<void> {
  const paperId = crypto.randomUUID()
  const row = { id: paperId, subject_id: paper.subjectId, year: paper.year, exam_type: paper.examType }
  const questions = questionRows(paper.questions, { subjectId: paper.subjectId, paperId, year: paper.year, promptVersion: paper.promptVersion })
  if (source.kind === 'demo') {
    demoDb.insert('past_papers', [row])
    demoDb.insert('questions', questions)
  } else {
    const saved = await source.client.from('past_papers').insert(row)
    if (saved.error) throw dbError(saved.error)
    if (questions.length > 0) {
      const { error } = await source.client.from('questions').insert(questions)
      if (error) throw dbError(error)
    }
  }
  await refreshPriorities(source, paper.subjectId)
}

/** Deletes a past paper with its questions. */
export async function deletePaper(source: DataSource, { subjectId, paperId }: { subjectId: string; paperId: string }): Promise<void> {
  if (source.kind === 'demo') {
    // Deleting a paper only unlinks its questions (like the database), so they are deleted first.
    demoDb.remove('questions', demoDb.list('questions').filter((q) => q.past_paper_id === paperId).map((q) => q.id))
    demoDb.remove('past_papers', [paperId])
  } else {
    const questions = await source.client.from('questions').delete().eq('past_paper_id', paperId)
    if (questions.error) throw dbError(questions.error)
    const { error } = await source.client.from('past_papers').delete().eq('id', paperId)
    if (error) throw dbError(error)
  }
  await refreshPriorities(source, subjectId)
}

export function usePapers(subjectId: string | undefined) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'papers', subjectId],
    queryFn: () => loadPapers(need(source), subjectId ?? ''),
    enabled: source !== null && Boolean(subjectId),
  })
}
