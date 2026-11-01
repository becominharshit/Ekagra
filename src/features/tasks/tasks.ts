import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CaptureResponseSchema, type SourceFile } from '@shared/schemas.ts'
import type { Subject } from '@/features/academics/subjects'
import { callAiFunction } from '@/features/ai/aiClient'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { TablesInsert, TablesUpdate } from '@/types/database'
import { capturedToDraft, type TaskDraft } from './drafts'
import { parseTasks } from './parseTasks'
import { byDue, isoWithOffset, type Task } from './taskRules'

// Tasks, saved in Supabase or (Demo Mode) on the device, and reading tasks from what the student
// typed or a screenshot (ai-capture; Demo Mode reads typed text on the device).

/** Task query keys start with this. The planner's fingerprint reads the tasks, so a change re-plans. */
export const tasksKey = (owner: string | null) => ['tasks', owner] as const

export async function listTasks(source: DataSource): Promise<Task[]> {
  if (source.kind === 'demo') return demoDb.list('tasks').sort(byDue)
  const { data, error } = await source.client.from('tasks').select('*').eq('user_id', source.userId)
  if (error) throw dbError(error)
  return data.sort(byDue)
}

export async function addTasks(source: DataSource, rows: TablesInsert<'tasks'>[]): Promise<void> {
  if (rows.length === 0) return
  if (source.kind === 'demo') {
    demoDb.insert('tasks', rows)
    return
  }
  const { error } = await source.client.from('tasks').insert(rows)
  if (error) throw dbError(error)
}

export async function updateTask(source: DataSource, { id, patch }: { id: string; patch: TablesUpdate<'tasks'> }): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.update('tasks', id, patch)
    return
  }
  const { error } = await source.client.from('tasks').update(patch).eq('id', id)
  if (error) throw dbError(error)
}

export async function deleteTask(source: DataSource, id: string): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.remove('tasks', [id])
    return
  }
  const { error } = await source.client.from('tasks').delete().eq('id', id)
  if (error) throw dbError(error)
}

/** Ticks a task off (or back on). The planner then stops (or starts again) planning time for it. */
export function setTaskDone(source: DataSource, { task, done }: { task: Task; done: boolean }): Promise<void> {
  return updateTask(source, { id: task.id, patch: done ? { status: 'done', completed_at: new Date().toISOString() } : { status: 'todo', completed_at: null } })
}

export interface CaptureInput {
  text: string
  file: SourceFile | null
  subjects: Pick<Subject, 'id' | 'name' | 'code'>[]
  now?: Date
}

/** The tasks in what the student typed or photographed, to check in the confirm sheet. Nothing is saved here. */
export async function readTasks(source: DataSource, { text, file, subjects, now = new Date() }: CaptureInput): Promise<TaskDraft[]> {
  if (source.kind === 'demo') {
    if (file) throw new Error("Demo Mode can't read screenshots (that needs the AI). Type the task instead, or sign in.")
    return parseTasks(text, { now, subjects })
  }
  const keyed = subjects.slice(0, 40).map((subject, index) => ({ key: `s${index + 1}`, subject }))
  const answer = await callAiFunction(
    'ai-capture',
    {
      text: text.trim() || undefined,
      file: file ?? undefined,
      now: isoWithOffset(now),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      subjects: keyed.map(({ key, subject }) => ({ key, name: subject.name, code: subject.code })),
    },
    CaptureResponseSchema,
  )
  const idByKey = new Map(keyed.map(({ key, subject }) => [key, subject.id]))
  return answer.tasks.map((task) => capturedToDraft(task, idByKey))
}

export function useTasks() {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...tasksKey(owner), 'list'],
    queryFn: () => listTasks(need(source)),
    enabled: source !== null,
  })
}

/** A change to tasks. Afterwards the task lists reload (and the plan keeper re-plans). */
export function useTaskMutation<Variables, Result>(run: (source: DataSource, variables: Variables) => Promise<Result>) {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: Variables) => run(need(source), variables),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tasksKey(owner) })
    },
  })
}
