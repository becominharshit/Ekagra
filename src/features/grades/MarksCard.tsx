import { useState, type FormEvent } from 'react'
import { format, parseISO } from 'date-fns'
import { LoaderCircle, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Subject } from '@/features/academics/subjects'
import { useCurriculum } from '@/features/academics/curriculum'
import { gradeForPercent, marksTotal } from './gpa'
import { addMark, deleteMark, markProblem, useGradeScale, useGradesMutation, useMarks } from './gradesData'

/** Numbers from the database can arrive as text ("24.50"): shown as 24.5. */
const num = (value: number | string) => String(Number(value))

/** A subject's internal, assignment and lab marks, with the total and the grade it points to. */
export function MarksCard({ subject }: { subject: Subject }) {
  const marks = useMarks()
  const scale = useGradeScale()
  const curriculum = useCurriculum()
  const remove = useGradesMutation(deleteMark)
  const [adding, setAdding] = useState(false)
  const own = (marks.data ?? []).filter((mark) => mark.subject_id === subject.id)
  const total = marksTotal(own)
  const suggested = gradeForPercent(scale, total.percent)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          Marks
          {total.percent !== null && <Badge variant="secondary">{Math.floor(total.percent * 10) / 10}%</Badge>}
        </CardTitle>
        <CardDescription>
          {own.length === 0
            ? 'Internal tests, assignments and lab marks, as they come.'
            : `${num(total.obtained)} of ${num(total.max)} so far${suggested ? `: about ${suggested.letter} at this rate` : ''}.`}{' '}
          {curriculum.creditsLabel} {subject.credits === null ? '–' : num(subject.credits)} · grade {subject.grade ?? '–'} ·{' '}
          <Link to="/academics/grades" className="underline underline-offset-3 hover:text-foreground">
            {curriculum.termLabel} and {curriculum.cumulativeLabel}
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {marks.error && (
          <p role="alert" className="text-destructive">
            {marks.error.message}
          </p>
        )}
        {own.length > 0 && (
          <ul className="grid gap-1">
            {own.map((mark) => (
              <li key={mark.id} className="flex items-center justify-between gap-2 border-t pt-1.5">
                <span className="min-w-0">
                  <span className="font-medium">{mark.assessment}</span>
                  {mark.date && <span className="text-muted-foreground"> · {format(parseISO(mark.date), 'd MMM')}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-1 tabular-nums">
                  {num(mark.obtained)} / {num(mark.max_marks)}
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${mark.assessment}`} disabled={remove.isPending} onClick={() => remove.mutate(mark.id)}>
                    <Trash2 aria-hidden />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {adding ? (
          <AddMarkForm subjectId={subject.id} onDone={() => setAdding(false)} />
        ) : (
          <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            Add marks
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function AddMarkForm({ subjectId, onDone }: { subjectId: string; onDone: () => void }) {
  const [assessment, setAssessment] = useState('')
  const [obtained, setObtained] = useState('')
  const [maxMarks, setMaxMarks] = useState('')
  const [date, setDate] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const add = useGradesMutation(addMark)

  function submit(event: FormEvent) {
    event.preventDefault()
    const input = { subjectId, assessment, obtained: Number(obtained), maxMarks: Number(maxMarks), date: date || null }
    const issue = obtained === '' || maxMarks === '' ? 'Fill in the marks and the maximum.' : markProblem(input)
    setProblem(issue)
    if (!issue) add.mutate(input, { onSuccess: onDone })
  }

  return (
    <form className="grid gap-2 rounded-lg border p-3" onSubmit={submit}>
      <div>
        <Label htmlFor="mark-assessment" className="mb-1 block text-xs font-medium">
          Test or assignment
        </Label>
        <Input id="mark-assessment" aria-label="Test or assignment" placeholder="e.g. Internal 1" maxLength={80} value={assessment} onChange={(event) => setAssessment(event.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="mark-obtained" className="mb-1 block text-xs font-medium">
            Marks
          </Label>
          <Input id="mark-obtained" type="number" inputMode="decimal" min={0} step="0.5" value={obtained} onChange={(event) => setObtained(event.target.value)} />
        </div>
        <div>
          <Label htmlFor="mark-max" className="mb-1 block text-xs font-medium">
            Out of
          </Label>
          <Input id="mark-max" type="number" inputMode="decimal" min={1} step="0.5" value={maxMarks} onChange={(event) => setMaxMarks(event.target.value)} />
        </div>
        <div>
          <Label htmlFor="mark-date" className="mb-1 block text-xs font-medium">
            Date
          </Label>
          <Input id="mark-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
      </div>
      {(problem ?? add.error) && (
        <p role="alert" className="text-destructive">
          {problem ?? add.error?.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={add.isPending}>
          {add.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
          Save marks
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
