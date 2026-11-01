import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useProfile } from '@/features/profile/queries'
import { readSettings } from '@/features/profile/settings'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Tables } from '@/types/database'

// Marks per subject and the results of earlier semesters, saved in Supabase or (Demo Mode) on the
// device. Credits and grades are columns of subjects (saved with updateSubject).

export type Mark = Tables<'marks'>
export type SemesterRow = Tables<'semester_results'>

export const gradesKey = (owner: string | null) => ['grades', owner] as const

const byDateThenCreated = (a: Mark, b: Mark) => (a.date ?? '').localeCompare(b.date ?? '') || a.created_at.localeCompare(b.created_at)

export async function listMarks(source: DataSource): Promise<Mark[]> {
  if (source.kind === 'demo') return demoDb.list('marks').sort(byDateThenCreated)
  const { data, error } = await source.client.from('marks').select('*').eq('user_id', source.userId).order('created_at')
  if (error) throw dbError(error)
  return data.sort(byDateThenCreated)
}

export interface MarkInput {
  subjectId: string
  assessment: string
  obtained: number
  maxMarks: number
  date: string | null
}

/** Why these marks can't be saved, or null. */
export function markProblem({ assessment, obtained, maxMarks }: Pick<MarkInput, 'assessment' | 'obtained' | 'maxMarks'>): string | null {
  if (!assessment.trim()) return 'Name the test or assignment, e.g. "Internal 1".'
  if (!Number.isFinite(maxMarks) || maxMarks <= 0) return 'The maximum marks must be more than 0.'
  if (!Number.isFinite(obtained) || obtained < 0) return 'Marks obtained can’t be negative.'
  if (obtained > maxMarks) return 'Marks obtained can’t be more than the maximum.'
  return null
}

export async function addMark(source: DataSource, input: MarkInput): Promise<void> {
  const problem = markProblem(input)
  if (problem) throw new Error(problem)
  const row = { subject_id: input.subjectId, assessment: input.assessment.trim().slice(0, 80), obtained: input.obtained, max_marks: input.maxMarks, date: input.date }
  if (source.kind === 'demo') {
    demoDb.insert('marks', [row])
    return
  }
  const { error } = await source.client.from('marks').insert(row)
  if (error) throw dbError(error)
}

export async function deleteMark(source: DataSource, id: string): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.remove('marks', [id])
    return
  }
  const { error } = await source.client.from('marks').delete().eq('id', id)
  if (error) throw dbError(error)
}

export async function listSemesterResults(source: DataSource): Promise<SemesterRow[]> {
  const bySemester = (a: SemesterRow, b: SemesterRow) => a.semester - b.semester
  if (source.kind === 'demo') return demoDb.list('semester_results').sort(bySemester)
  const { data, error } = await source.client.from('semester_results').select('*').eq('user_id', source.userId).order('semester')
  if (error) throw dbError(error)
  return data.sort(bySemester)
}

export interface SemesterInput {
  semester: number
  sgpa: number
  credits: number
}

export function semesterProblem({ semester, sgpa, credits }: SemesterInput): string | null {
  if (!Number.isInteger(semester) || semester < 1 || semester > 16) return 'The semester is a whole number from 1 to 16.'
  if (!Number.isFinite(sgpa) || sgpa < 0 || sgpa > 10) return 'The SGPA goes from 0 to 10.'
  if (!Number.isFinite(credits) || credits <= 0 || credits > 100) return 'Credits go from more than 0 to 100.'
  return null
}

/** Saves a semester's result; a semester that's already there is changed. */
export async function saveSemesterResult(source: DataSource, input: SemesterInput): Promise<void> {
  const problem = semesterProblem(input)
  if (problem) throw new Error(problem)
  const row = { semester: input.semester, sgpa: input.sgpa, credits: input.credits }
  if (source.kind === 'demo') {
    const existing = demoDb.list('semester_results').find((result) => result.semester === input.semester)
    if (existing) demoDb.update('semester_results', existing.id, row)
    else demoDb.insert('semester_results', [row])
    return
  }
  const { error } = await source.client.from('semester_results').upsert({ ...row, user_id: source.userId }, { onConflict: 'user_id,semester' })
  if (error) throw dbError(error)
}

export async function deleteSemesterResult(source: DataSource, id: string): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.remove('semester_results', [id])
    return
  }
  const { error } = await source.client.from('semester_results').delete().eq('id', id)
  if (error) throw dbError(error)
}

export function useMarks() {
  const { source, owner } = useDataSource()
  return useQuery({ queryKey: [...gradesKey(owner), 'marks'], queryFn: () => listMarks(need(source)), enabled: source !== null })
}

export function useSemesterResults() {
  const { source, owner } = useDataSource()
  return useQuery({ queryKey: [...gradesKey(owner), 'semesters'], queryFn: () => listSemesterResults(need(source)), enabled: source !== null })
}

/** A change to marks or semester results. Afterwards the grades views reload. */
export function useGradesMutation<Variables>(run: (source: DataSource, variables: Variables) => Promise<void>) {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: Variables) => run(need(source), variables),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: gradesKey(owner) })
    },
  })
}

/** The student's grade scale (10-point unless changed). */
export function useGradeScale() {
  const profile = useProfile()
  return readSettings(profile.data?.settings).grades.scale
}
