import { useState, type FormEvent } from 'react'
import { ArrowLeft, LoaderCircle, Pencil, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCurriculum, type CurriculumProfile } from '@/features/academics/curriculum'
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

/** Academics → Grades (/academics/grades): Term GPA/SGPA from subjects, cumulative average with earlier terms. */
export function GradesPage() {
  const profile = useProfile()
  const subjects = useSubjects()
  const marks = useMarks()
  const semesters = useSemesterResults()
  const scale = useGradeScale()
  const curriculum = useCurriculum()
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
      <PageHeader
        title="Grades"
        subtitle={`${curriculum.termLabel} from your subjects' ${curriculum.creditsLabel.toLowerCase()} and grades, ${curriculum.cumulativeLabel} with your earlier terms.`}
      />
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
              <p className="text-sm text-muted-foreground">
                {curriculum.termLabel}
                {current ? ` (term ${current})` : ''}
              </p>
              <p className="font-heading text-3xl font-semibold tabular-nums">{gpaLabel(now.sgpa)}</p>
              <p className="text-xs text-muted-foreground">
                {now.missing > 0
                  ? `${now.missing} ${now.missing === 1 ? 'subject is' : 'subjects are'} still without a grade`
                  : `${now.credits} ${curriculum.creditsLabel.toLowerCase()}`}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{curriculum.cumulativeLabel}</p>
              <p className="font-heading text-3xl font-semibold tabular-nums">{gpaLabel(overall.cgpa)}</p>
              <p className="text-xs text-muted-foreground">
                {overall.credits > 0 ? `${overall.credits} ${curriculum.creditsLabel.toLowerCase()}` : 'Add earlier terms below'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>This term</CardTitle>
            <CardDescription>
              {curriculum.creditsLabel} from your syllabus, and the grade you got (or expect). Your marks so far suggest a grade
              {current === null && '. Set your term in Me → Edit routine and budget'}.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {subjects.data && courses.length === 0 && <p className="text-sm text-muted-foreground">Add your subjects in Academics first.</p>}
            {courses.map((subject) => (
              <SubjectGradeRow
                key={subject.id}
                subject={subject}
                scale={scale}
                creditsLabel={curriculum.creditsLabel}
                marks={(marks.data ?? []).filter((mark) => mark.subject_id === subject.id)}
              />
            ))}
          </CardContent>
        </Card>

        <EarlierSemesters rows={semesters.data ?? []} current={current} curriculum={curriculum} />
        <TargetCard
          earlier={earlierResults}
          currentCredits={currentCredits}
          maxPoints={Math.max(...scale.map((step) => step.points))}
          curriculum={curriculum}
        />
        <GradeScaleEditor key={curriculum.id} scale={scale} curriculum={curriculum} />
      </div>
    </>
  )
}

function SubjectGradeRow({ subject, scale, creditsLabel, marks }: { subject: Subject; scale: GradeStep[]; creditsLabel: string; marks: Mark[] }) {
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
          <span className="text-xs text-muted-foreground">{creditsLabel}</span>
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

function EarlierSemesters({ rows, current, curriculum }: { rows: SemesterRow[]; current: number | null; curriculum: CurriculumProfile }) {
  const save = useGradesMutation(saveSemesterResult)
  const remove = useGradesMutation(deleteSemesterResult)
  const [semester, setSemester] = useState('')
  const [sgpaText, setSgpaText] = useState('')
  const [credits, setCredits] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    const input = { semester: Number(semester), sgpa: Number(sgpaText), credits: Number(credits) }
    const issue =
      !semester || !sgpaText || !credits
        ? `Fill in the term, its ${curriculum.termLabel} and its ${curriculum.creditsLabel.toLowerCase()}.`
        : semesterProblem(input, curriculum.maxGradePoints, curriculum.termLabel)
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
        <CardTitle>Earlier terms</CardTitle>
        <CardDescription>
          From your transcripts: each term&apos;s {curriculum.termLabel} and total {curriculum.creditsLabel.toLowerCase()}.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {rows.length > 0 && (
          <ul className="grid gap-1">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-2 border-t pt-1.5 first:border-t-0">
                <span>
                  Term {row.semester}: <span className="font-medium tabular-nums">{gpaLabel(Number(row.sgpa))}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    · {Number(row.credits)} {curriculum.creditsLabel.toLowerCase()}
                  </span>
                  {current !== null && row.semester >= current && <span className="text-muted-foreground"> (not counted: this term comes from your subjects)</span>}
                </span>
                <span className="flex shrink-0">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Change term ${row.semester}`}
                    onClick={() => {
                      setSemester(String(row.semester))
                      setSgpaText(String(Number(row.sgpa)))
                      setCredits(String(Number(row.credits)))
                    }}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete term ${row.semester}`} disabled={remove.isPending} onClick={() => remove.mutate(row.id)}>
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
              <span className="text-xs text-muted-foreground">Term</span>
              <Input type="number" inputMode="numeric" min={1} max={16} value={semester} onChange={(event) => setSemester(event.target.value)} />
            </Label>
            <Label className="grid gap-1 font-normal">
              <span className="text-xs text-muted-foreground">{curriculum.termLabel}</span>
              <Input type="number" inputMode="decimal" min={0} max={curriculum.maxGradePoints} step="0.01" value={sgpaText} onChange={(event) => setSgpaText(event.target.value)} />
            </Label>
            <Label className="grid gap-1 font-normal">
              <span className="text-xs text-muted-foreground">{curriculum.creditsLabel}</span>
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
            Save term
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function TargetCard({
  earlier,
  currentCredits,
  maxPoints,
  curriculum,
}: {
  earlier: { credits: number; sgpa: number }[]
  currentCredits: number
  maxPoints: number
  curriculum: CurriculumProfile
}) {
  const [target, setTarget] = useState('')
  const value = Number(target)
  const needed = target === '' || !Number.isFinite(value) ? null : requiredSgpa(value, earlier, currentCredits)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Target {curriculum.cumulativeLabel}</CardTitle>
        <CardDescription>The {curriculum.termLabel} you need this term to reach it.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        <Label className="grid max-w-44 gap-1 font-normal">
          <span className="text-xs text-muted-foreground">Target {curriculum.cumulativeLabel}</span>
          <Input type="number" inputMode="decimal" min={0} max={maxPoints} step="0.1" value={target} onChange={(event) => setTarget(event.target.value)} />
        </Label>
        {target !== '' && (
          <p role="status">
            {currentCredits <= 0
              ? `Add the ${curriculum.creditsLabel.toLowerCase()} of this term’s subjects first.`
              : needed === null
                ? ''
                : needed > maxPoints
                  ? `Not reachable this term: it would need ${curriculum.termLabel} ${gpaLabel(needed)}.`
                  : needed <= 0
                    ? 'You’re there whatever this term brings.'
                    : `You need ${curriculum.termLabel} ${gpaLabel(needed)} this term.`}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
