import { useState, type ChangeEvent } from 'react'
import { Camera, LoaderCircle, Plus, Sparkles } from 'lucide-react'
import type { SourceFile } from '@shared/schemas.ts'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useSubjects } from '@/features/academics/subjects'
import { useAuthStore } from '@/features/auth/authStore'
import { need, useDataSource } from '@/lib/dataSource'
import { fileToSource } from '@/lib/files'
import { useCaptureStore } from './captureStore'
import { blankDraft, draftProblems, draftValues, type TaskDraft } from './drafts'
import { TaskDraftFields } from './TaskDraftFields'
import { addTasks, readTasks, useTaskMutation } from './tasks'

/** The global + Capture sheet: type tasks or add a screenshot, check them, save. */
export function CaptureSheet() {
  const open = useCaptureStore((state) => state.open)
  const setOpen = useCaptureStore((state) => state.setOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        {/* The flow only exists while the sheet is open, so it starts fresh every time. */}
        {open && <CaptureFlow onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function CaptureFlow({ onDone }: { onDone: () => void }) {
  const isDemo = useAuthStore((state) => state.status === 'demo')
  const { source } = useDataSource()
  const subjects = useSubjects()
  const [text, setText] = useState('')
  const [file, setFile] = useState<{ source: SourceFile; name: string } | null>(null)
  const [drafts, setDrafts] = useState<TaskDraft[] | null>(null)
  const [reading, setReading] = useState(false)
  const [problems, setProblems] = useState<string[]>([])
  const save = useTaskMutation<TaskDraft[], void>((dataSource, list) =>
    addTasks(
      dataSource,
      list.map((draft) => ({
        ...draftValues(draft),
        source: file ? 'screenshot' : text.trim() ? 'text' : 'manual',
        source_ref: file ? file.name : text.trim().slice(0, 500) || null,
      })),
    ),
  )
  const subjectList = subjects.data ?? []

  async function pickScreenshot(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0]
    event.target.value = ''
    if (!picked) return
    try {
      setFile({ source: await fileToSource(picked), name: picked.name })
      setProblems([])
    } catch (error) {
      setProblems([error instanceof Error ? error.message : "Couldn't read that image."])
    }
  }

  async function read() {
    setReading(true)
    setProblems([])
    try {
      const found = await readTasks(need(source), { text, file: file?.source ?? null, subjects: subjectList })
      if (found.length === 0) setProblems(['No tasks found. Try writing one task per line, e.g. "DBMS assignment due Friday 5pm".'])
      else setDrafts(found)
    } catch (error) {
      setProblems([error instanceof Error ? error.message : 'The tasks could not be read. Please try again.'])
    } finally {
      setReading(false)
    }
  }

  function trySave() {
    if (!drafts) return
    const issues = [...new Set(drafts.flatMap(draftProblems))]
    setProblems(issues)
    if (issues.length === 0) save.mutate(drafts, { onSuccess: onDone })
  }

  if (!drafts) {
    return (
      <div className="grid gap-4">
        <DialogHeader>
          <DialogTitle>Capture tasks</DialogTitle>
          <DialogDescription>Type them the way you'd text a friend, one per line, or add a screenshot of the portal or a WhatsApp message.</DialogDescription>
        </DialogHeader>
        <Textarea
          aria-label="Tasks"
          rows={4}
          placeholder={'DBMS assignment due Friday 5pm\nPay hostel fees by 15/11 urgent'}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        {isDemo ? (
          <p className="text-xs text-muted-foreground">Demo Mode reads typed tasks on your device. Screenshots need the AI (sign in).</p>
        ) : (
          <label className="flex items-center gap-2 text-sm">
            <Camera className="size-4 text-muted-foreground" aria-hidden />
            <Input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Screenshot" onChange={(event) => void pickScreenshot(event)} />
          </label>
        )}
        {file && <p className="text-xs text-muted-foreground">The AI will read {file.name}.</p>}
        {problems.length > 0 && (
          <p role="alert" className="text-sm text-destructive">
            {problems[0]}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setDrafts([blankDraft()])}>
            <Plus aria-hidden />
            Type one myself
          </Button>
          <Button disabled={reading || (!text.trim() && !file)} onClick={() => void read()}>
            {reading ? <LoaderCircle className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            {reading ? 'Reading…' : 'Read tasks'}
          </Button>
        </DialogFooter>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Check before saving</DialogTitle>
        <DialogDescription>
          {drafts.length === 1 ? '1 task' : `${drafts.length} tasks`}. The planner then schedules work time before each deadline.
        </DialogDescription>
      </DialogHeader>
      {drafts.map((draft) => (
        <TaskDraftFields
          key={draft.key}
          draft={draft}
          subjects={subjectList}
          onChange={(next) => setDrafts(drafts.map((other) => (other.key === draft.key ? next : other)))}
          onRemove={drafts.length > 1 ? () => setDrafts(drafts.filter((other) => other.key !== draft.key)) : undefined}
        />
      ))}
      <Button variant="ghost" className="justify-self-start" onClick={() => setDrafts([...drafts, blankDraft()])}>
        <Plus aria-hidden />
        Add another
      </Button>
      {(problems.length > 0 || save.error) && (
        <div role="alert" className="grid gap-1 text-sm text-destructive">
          {problems.map((problem) => (
            <p key={problem}>{problem}</p>
          ))}
          {save.error && <p>{save.error.message}</p>}
        </div>
      )}
      {/* Stays at the bottom while a long list of tasks (e.g. from a screenshot) scrolls. */}
      <DialogFooter className="sticky bottom-0 bg-popover">
        <Button variant="outline" onClick={() => setDrafts(null)}>
          Back
        </Button>
        <Button disabled={save.isPending} onClick={trySave}>
          {save.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
          Save {drafts.length === 1 ? 'task' : `${drafts.length} tasks`}
        </Button>
      </DialogFooter>
    </div>
  )
}
