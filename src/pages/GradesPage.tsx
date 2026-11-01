import { useState, type FormEvent } from 'react'
import { ArrowLeft, LoaderCircle, Pencil, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { updateSubject, useAcademicsMutation, useSubjects, type Subject } from '@/features/academics/subjects'
import { cgpa, gpaLabel, gradeForPercent, marksTotal, requiredSgpa, sgpa, type GradeStep } from '@/features/grades/gpa'
import { GradeScaleEditor } from '@/features/grades/GradeScaleEditor'
import {
  deleteSemesterResult,
  saveSemesterResult,
  semesterProblem,
  useGradeScale,
  useGradesMutation,
  useMarks,
  useSemesterResults,
  type Mark,
  type SemesterRow,
} from '@/features/grades/gradesData'
import { useProfile } from '@/features/profile/queries'

const NO_GRADE = 'none'

/** Academics → Grades (/academics/grades): SGPA from this semester's subjects, CGPA with earlier semesters. */
export function GradesPage() {
  const profile = useProfile()
  const subjects = useSubjects()
  const marks = useMarks()
  const semesters = useSemesterResults()
  const scale = useGradeScale()
  const current = profile.data?.semester ?? null
  const courses = (subjects.data ?? []).filter((subject) => subject.kind === 'course')
  const now = sgpa(courses, scale)
  const currentCredits = courses.reduce((sum, subject) => sum + Math.max(0, Number(subject.credits ?? 0)), 0)
  // Results typed in for this semester or later don't count twice: this semester comes from the subjects.
  const earlier = (semesters.data ?? []).filter((row) => current === null || row.semester < current)
  const earlierResults = earlier.map((row) => ({ credits: Number(row.credits), sgpa: Number(row.sgpa) }))
  const overall = cgpa([...earlierResults, ...(now.sgpa !== null ? [{ credits: now.credits, sgpa: now.sgpa }] : [])])
  const loading = subjects.isPending || marks.isPending || semesters.isPending
  const problem = subjects.error ?? marks.error ?? semesters.error

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link to="/academics">
          <ArrowLeft aria-hidden />
          Academics
        </Link>
      </Button>
      <PageHeader title="Grades" subtitle="SGPA from your subjects' credits and grades, CGPA with your earlier semesters." />
      <div className="grid gap-4">
        {loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Loading…
          </p>
        )}
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem.message}
          </p>
        )}

        <Card>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">SGPA{current ? ` (semester ${current})` : ''}</p>
              <p className="font-heading text-3xl font-semibold tabular-nums">{gpaLabel(now.sgpa)}</p>
              <p className="text-xs text-muted-foreground">
                {now.missing > 0 ? `${now.missing} ${now.missing === 1 ? 'subject is' : 'subjects are'} still without a grade` : `${now.credits} credits`}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">CGPA</p>
              <p className="font-heading text-3xl font-semibold tabular-nums">{gpaLabel(overall.cgpa)}</p>
              <p className="text-xs text-muted-foreground">{overall.credits > 0 ? `${overall.credits} credits` : 'Add earlier semesters below'}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>This semester</CardTitle>
            <CardDescription>
              Credits from your syllabus, and the grade you got (or expect). Your marks so far suggest a grade
              {current === null && '. Set your semester in Me → Edit routine and budget'}.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {subjects.data && courses.length === 0 && <p className="text-sm text-muted-foreground">Add your subjects in Academics first.</p>}
            {courses.map((subject) => (
              <SubjectGradeRow key={subject.id} subject={subject} scale={scale} marks={(marks.data ?? []).filter((mark) => mark.subject_id === subject.id)} />
            ))}
          </CardContent>
        </Card>

        <EarlierSemesters rows={semesters.data ?? []} current={current} />
        <TargetCard earlier={earlierResults} currentCredits={currentCredits} maxPoints={Math.max(...scale.map((step) => step.points))} />
        <GradeScaleEditor scale={scale} />
      </div>
    </>
  )
}

function SubjectGradeRow({ subject, scale, marks }: { subject: Subject; scale: GradeStep[]; marks: Mark[] }) {
  const save = useAcademicsMutation<{ credits?: number | null; grade?: string | null }, Subject>((source, patch) => updateSubject(source, subject.id, patch))
  const [credits, setCredits] = useState(subject.credits === null ? '' : String(Number(subject.credits)))
  const [problem, setProblem] = useState<string | null>(null)
  const total = marksTotal(marks)
  const suggested = gradeForPercent(scale, total.percent)
  const known = subject.grade !== null && scale.some((step) => step.letter === subject.grade)

  function saveCredits() {
    const value = credits.trim() === '' ? null : Number(credits)
    if (value !== null && (!Number.isFinite(value) || value <= 0 || value > 30)) {
      setProblem('Credits go from more than 0 to 30.')
      return
    }
    setProblem(null)
    if (value !== (subject.credits === null ? null : Number(subject.credits))) save.mutate({ credits: value })
  }

  return (
    <div className="grid gap-1.5 border-t pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-2">
        <Link to={`/academics/subjects/${subject.id}`} className="min-w-0 truncate font-medium underline-offset-4 hover:underline">
          {subject.name}
        </Link>
        {total.percent !== null && (
          <span className="shrink-0 text-xs text-muted-foreground">
            Marks {Math.floor(total.percent * 10) / 10}%{suggested ? ` ≈ ${suggested.letter}` : ''}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Label className="grid gap-1 font-normal">
          <span className="text-xs text-muted-foreground">Credits</span>
          <Input type="number" inputMode="decimal" min={0.5} max={30} step="0.5" value={credits} onChange={(event) => setCredits(event.target.value)} onBlur={saveCredits} />
        </Label>
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Grade</span>
          <Select value={known && subject.grade ? subject.grade : NO_GRADE} onValueChange={(value) => save.mutate({ grade: value === NO_GRADE ? null : value })}>
            <SelectTrigger aria-label={`Grade for ${subject.name}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_GRADE}>Not yet</SelectItem>
              {scale.map((step) => (
                <SelectItem key={step.letter} value={step.letter}>
                  {step.letter} ({step.points})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {(problem ?? save.error) && (
        <p role="alert" className="text-sm text-destructive">
          {problem ?? save.error?.message}
        </p>
      )}
    </div>
  )
}

function EarlierSemesters({ rows, current }: { rows: SemesterRow[]; current: number | null }) {
  const save = useGradesMutation(saveSemesterResult)
  const remove = useGradesMutation(deleteSemesterResult)
  const [semester, setSemester] = useState('')
  const [sgpaText, setSgpaText] = useState('')
  const [credits, setCredits] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    const input = { semester: Number(semester), sgpa: Number(sgpaText), credits: Number(credits) }
    const issue = !semester || !sgpaText || !credits ? 'Fill in the semester, its SGPA and its credits.' : semesterProblem(input)
    setProblem(issue)
    if (issue) return
    save.mutate(input, {
      onSuccess: () => {
        setSemester('')
        setSgpaText('')
        setCredits('')
      },
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Earlier semesters</CardTitle>
        <CardDescription>From your marksheets: each semester's SGPA and total credits.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {rows.length > 0 && (
          <ul className="grid gap-1">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-2 border-t pt-1.5 first:border-t-0">
                <span>
                  Semester {row.semester}: <span className="font-medium tabular-nums">{gpaLabel(Number(row.sgpa))}</span>
                  <span className="text-muted-foreground"> · {Number(row.credits)} credits</span>
                  {current !== null && row.semester >= current && <span className="text-muted-foreground"> (not counted: this semester comes from your subjects)</span>}
                </span>
                <span className="flex shrink-0">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Change semester ${row.semester}`}
                    onClick={() => {
                      setSemester(String(row.semester))
                      setSgpaText(String(Number(row.sgpa)))
                      setCredits(String(Number(row.credits)))
                    }}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete semester ${row.semester}`} disabled={remove.isPending} onClick={() => remove.mutate(row.id)}>
                    <Trash2 aria-hidden />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <form className="grid gap-2" onSubmit={submit}>
          <div className="grid grid-cols-3 gap-2">
            <Label className="grid gap-1 font-normal">
              <span className="text-xs text-muted-foreground">Semester</span>
              <Input type="number" inputMode="numeric" min={1} max={16} value={semester} onChange={(event) => setSemester(event.target.value)} />
            </Label>
            <Label className="grid gap-1 font-normal">
              <span className="text-xs text-muted-foreground">SGPA</span>
              <Input type="number" inputMode="decimal" min={0} max={10} step="0.01" value={sgpaText} onChange={(event) => setSgpaText(event.target.value)} />
            </Label>
            <Label className="grid gap-1 font-normal">
              <span className="text-xs text-muted-foreground">Credits</span>
              <Input type="number" inputMode="decimal" min={1} max={100} step="0.5" value={credits} onChange={(event) => setCredits(event.target.value)} />
            </Label>
          </div>
          {(problem ?? save.error ?? remove.error) && (
            <p role="alert" className="text-destructive">
              {problem ?? save.error?.message ?? remove.error?.message}
            </p>
          )}
          <Button type="submit" variant="outline" size="sm" className="justify-self-start" disabled={save.isPending}>
            {save.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
            Save semester
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function TargetCard({ earlier, currentCredits, maxPoints }: { earlier: { credits: number; sgpa: number }[]; currentCredits: number; maxPoints: number }) {
  const [target, setTarget] = useState('')
  const value = Number(target)
  const needed = target === '' || !Number.isFinite(value) ? null : requiredSgpa(value, earlier, currentCredits)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Target CGPA</CardTitle>
        <CardDescription>The SGPA you need this semester to reach it.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        <Label className="grid max-w-40 gap-1 font-normal">
          <span className="text-xs text-muted-foreground">Target CGPA</span>
          <Input type="number" inputMode="decimal" min={0} max={10} step="0.1" value={target} onChange={(event) => setTarget(event.target.value)} />
        </Label>
        {target !== '' && (
          <p role="status">
            {currentCredits <= 0
              ? 'Add the credits of this semester’s subjects first.'
              : needed === null
                ? ''
                : needed > maxPoints
                  ? `Not reachable this semester: it would need an SGPA of ${gpaLabel(needed)}.`
                  : needed <= 0
                    ? 'You’re there whatever this semester brings.'
                    : `You need an SGPA of ${gpaLabel(needed)} this semester.`}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
