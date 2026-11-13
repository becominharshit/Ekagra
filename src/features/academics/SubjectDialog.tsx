import { useState, type FormEvent } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCurriculum } from './curriculum'
import { createSubject, updateSubject, useAcademicsMutation, type Subject } from './subjects'

interface SubjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The subject to edit. Without it, a new subject is added. */
  subject?: Subject | null
  onSaved?: (subject: Subject) => void
}

/** Add a subject, or change its name, code and exam date. */
export function SubjectDialog({ open, onOpenChange, subject, onSaved }: SubjectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* The form only exists while the dialog is open, so it starts fresh every time. */}
        <SubjectForm
          subject={subject ?? null}
          onDone={(saved) => {
            onOpenChange(false)
            onSaved?.(saved)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function SubjectForm({ subject, onDone }: { subject: Subject | null; onDone: (subject: Subject) => void }) {
  const curriculum = useCurriculum()
  const [name, setName] = useState(subject?.name ?? '')
  const [code, setCode] = useState(subject?.code ?? '')
  const [examDate, setExamDate] = useState(subject?.exam_date ?? '')
  const [credits, setCredits] = useState(subject?.credits == null ? '' : String(Number(subject.credits)))
  const [problem, setProblem] = useState<string | null>(null)
  const save = useAcademicsMutation<void, Subject>(async (source) => {
    const values = { name: name.trim(), code: code.trim() || null, exam_date: examDate || null, credits: credits.trim() === '' ? null : Number(credits) }
    return subject ? updateSubject(source, subject.id, values) : createSubject(source, values)
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setProblem('Please enter the subject name.')
      return
    }
    const creditValue = Number(credits)
    if (credits.trim() !== '' && (!Number.isFinite(creditValue) || creditValue <= 0 || creditValue > 30)) {
      setProblem('Credits go from more than 0 to 30 (or leave them empty).')
      return
    }
    setProblem(null)
    save.mutate(undefined, { onSuccess: onDone })
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{subject ? 'Edit subject' : 'Add a subject'}</DialogTitle>
        <DialogDescription>The exam date lets the plan switch to exam season 21 days before it.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="subject-name">Name</Label>
        <Input id="subject-name" placeholder="e.g. Database Management Systems" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="subject-code">Code</Label>
          <Input id="subject-code" placeholder="e.g. CS301" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="subject-exam">Exam date</Label>
          <Input id="subject-exam" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
        </div>
      </div>
      <div className="grid max-w-44 gap-2">
        <Label htmlFor="subject-credits">
          {curriculum.creditsLabel} (for {curriculum.termLabel})
        </Label>
        <Input id="subject-credits" type="number" inputMode="decimal" min={0.5} max={30} step="0.5" placeholder="e.g. 4" value={credits} onChange={(e) => setCredits(e.target.value)} />
      </div>
      {(problem || save.error) && (
        <p role="alert" className="text-sm text-destructive">
          {problem ?? save.error?.message}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
          {subject ? 'Save' : 'Add subject'}
        </Button>
      </DialogFooter>
    </form>
  )
}
