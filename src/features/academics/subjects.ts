import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'

// Subjects, saved in Supabase or (Demo Mode) on the device.

export type Subject = Tables<'subjects'>

/** Every Academics query key starts with this, so one refresh after a change updates them all. */
export const academicsKey = (owner: string | null) => ['academics', owner] as const

const byCreated = (a: { created_at: string }, b: { created_at: string }) => Date.parse(a.created_at) - Date.parse(b.created_at)

export async function listSubjects(source: DataSource): Promise<Subject[]> {
  if (source.kind === 'demo') return demoDb.list('subjects').filter((subject) => subject.archived_at === null).sort(byCreated)
  const { data, error } = await source.client
    .from('subjects')
    .select('*')
    .eq('user_id', source.userId)
    .is('archived_at', null)
    .order('created_at')
  if (error) throw dbError(error)
  return data
}

export async function createSubject(source: DataSource, values: TablesInsert<'subjects'>): Promise<Subject> {
  if (source.kind === 'demo') {
    const [row] = demoDb.insert('subjects', [values])
    if (!row) throw new Error('The subject was not saved.')
    return row
  }
  const { data, error } = await source.client.from('subjects').insert(values).select().single()
  if (error) throw dbError(error)
  return data
}

export async function updateSubject(source: DataSource, id: string, patch: TablesUpdate<'subjects'>): Promise<Subject> {
  if (source.kind === 'demo') return demoDb.update('subjects', id, patch)
  const { data, error } = await source.client.from('subjects').update(patch).eq('id', id).select().single()
  if (error) throw dbError(error)
  return data
}

/** Deletes the subject with its roadmap, past papers and everything linked to its topics. */
export async function deleteSubject(source: DataSource, id: string): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.remove('subjects', [id])
    return
  }
  const { error } = await source.client.from('subjects').delete().eq('id', id)
  if (error) throw dbError(error)
}

export function useSubjects() {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'subjects'],
    queryFn: () => listSubjects(need(source)),
    enabled: source !== null,
  })
}

export function useSubject(subjectId: string | undefined) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'subjects'],
    queryFn: () => listSubjects(need(source)),
    enabled: source !== null,
    select: (subjects) => subjects.find((subject) => subject.id === subjectId) ?? null,
  })
}

/** A change to Academics data. Afterwards every Academics screen (and the plan) reloads. */
export function useAcademicsMutation<Variables, Result>(run: (source: DataSource, variables: Variables) => Promise<Result>) {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: Variables) => run(need(source), variables),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: academicsKey(owner) })
    },
  })
}
