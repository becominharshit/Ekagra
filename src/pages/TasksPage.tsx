import { useState } from 'react'
import { ArrowLeft, Check, Pencil, Plus, Trash2, Undo2 } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useSubjects, type Subject } from '@/features/academics/subjects'
import { useCaptureStore } from '@/features/tasks/captureStore'
import { draftProblems, draftValues, taskToDraft, type TaskDraft } from '@/features/tasks/drafts'
import { TaskDraftFields } from '@/features/tasks/TaskDraftFields'
import { AREA_LABEL, dueLabel, isOpenTask, toTaskArea, type Task } from '@/features/tasks/taskRules'
import { deleteTask, setTaskDone, updateTask, useTaskMutation, useTasks } from '@/features/tasks/tasks'
import { useNow } from '@/hooks/useNow'
import { cn } from '@/lib/utils'

/** Every task: open ones by due date, then the ones done recently. */
export function TasksPage() {
  const now = useNow(60_000)
  const tasks = useTasks()
  const subjects = useSubjects()
  const toggle = useTaskMutation(setTaskDone)
  const remove = useTaskMutation(deleteTask)
  const openCapture = useCaptureStore((state) => state.setOpen)
  const [editing, setEditing] = useState<Task | null>(null)
  const [deleting, setDeleting] = useState<Task | null>(null)

  const open = (tasks.data ?? []).filter(isOpenTask)
  const finished = (tasks.data ?? [])
    .filter((task) => !isOpenTask(task))
    .sort((a, b) => Date.parse(b.completed_at ?? b.updated_at) - Date.parse(a.completed_at ?? a.updated_at))
    .slice(0, 15)
  const subjectOf = (task: Task) => subjects.data?.find((subject) => subject.id === task.subject_id)
  const error = tasks.error ?? toggle.error ?? remove.error

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link to="/today">
          <ArrowLeft aria-hidden />
          Today
        </Link>
      </Button>
      <PageHeader title="Tasks" subtitle="Assignments, to-dos and deadlines. The planner schedules work time before each one." />
      <div className="grid gap-4">
        <Button className="justify-self-start" onClick={() => openCapture(true)}>
          <Plus aria-hidden />
          Capture tasks
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
        )}
        {tasks.data && open.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Nothing to do</CardTitle>
              <CardDescription>Add an assignment like "DBMS assignment due Friday 5pm", or a screenshot of the portal.</CardDescription>
            </CardHeader>
          </Card>
        )}
        {open.map((task) => {
          const overdue = task.due_at !== null && Date.parse(task.due_at) < now.getTime()
          const subject = subjectOf(task)
          return (
            <Card key={task.id} size="sm">
              <CardContent className="flex items-start gap-3">
                <Button variant="outline" size="icon" className="mt-0.5 size-7 shrink-0 rounded-full" aria-label={`Mark "${task.title}" done`} disabled={toggle.isPending} onClick={() => toggle.mutate({ task, done: true })}>
                  <Check className="size-3.5" aria-hidden />
                </Button>
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <p className="font-medium">{task.title}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className={cn(overdue && 'font-medium text-destructive')}>{dueLabel(task.due_at, now)}</span>
                    {[subject ? (subject.code ?? subject.name) : AREA_LABEL[toTaskArea(task.area)], task.est_minutes ? `${task.est_minutes} min` : null]
                      .filter(Boolean)
                      .map((part) => ` · ${part}`)
                      .join('')}
                  </p>
                </div>
                {task.priority === 1 && <Badge variant="destructive">Urgent</Badge>}
                <Button variant="ghost" size="icon" aria-label={`Edit "${task.title}"`} onClick={() => setEditing(task)}>
                  <Pencil aria-hidden />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Delete "${task.title}"`} onClick={() => setDeleting(task)}>
                  <Trash2 aria-hidden />
                </Button>
              </CardContent>
            </Card>
          )
        })}

        {finished.length > 0 && (
          <Card size="sm">
            <CardHeader>
              <CardTitle>Done recently</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-1">
                {finished.map((task) => (
                  <li key={task.id} className="flex items-center gap-2 text-sm">
                    <Check className="size-4 shrink-0 text-emerald-600" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-muted-foreground line-through">{task.title}</span>
                    <Button variant="ghost" size="sm" disabled={toggle.isPending} onClick={() => toggle.mutate({ task, done: false })}>
                      <Undo2 aria-hidden />
                      Undo
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={editing !== null} onOpenChange={(isOpen) => !isOpen && setEditing(null)}>
        <DialogContent>{editing && <EditTask task={editing} subjects={subjects.data ?? []} onDone={() => setEditing(null)} />}</DialogContent>
      </Dialog>
      <AlertDialog open={deleting !== null} onOpenChange={(isOpen) => !isOpen && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>The task and its planned work time are removed. To keep it, tick it off instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) remove.mutate(deleting.id)
                setDeleting(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function EditTask({ task, subjects, onDone }: { task: Task; subjects: Subject[]; onDone: () => void }) {
  const [draft, setDraft] = useState<TaskDraft>(() => taskToDraft(task))
  const [problems, setProblems] = useState<string[]>([])
  const save = useTaskMutation(updateTask)
  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Edit task</DialogTitle>
      </DialogHeader>
      <TaskDraftFields draft={draft} subjects={subjects} onChange={setDraft} />
      {(problems.length > 0 || save.error) && (
        <p role="alert" className="text-sm text-destructive">
          {problems[0] ?? save.error?.message}
        </p>
      )}
      <DialogFooter>
        <Button
          disabled={save.isPending}
          onClick={() => {
            const issues = draftProblems(draft)
            setProblems(issues)
            if (issues.length === 0) save.mutate({ id: task.id, patch: draftValues(draft) }, { onSuccess: onDone })
          }}
        >
          Save
        </Button>
      </DialogFooter>
    </div>
  )
}
