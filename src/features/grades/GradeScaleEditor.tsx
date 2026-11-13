import { useState } from 'react'
import { LoaderCircle, Plus, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { CURRICULUM_LIST, curriculumForProfile, getCurriculumProfile, type CurriculumProfile } from '@/features/academics/curriculum'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useProfile, useSaveSettings } from '@/features/profile/queries'
import { scaleProblems, type GradeStep } from './gpa'

type Row = { letter: string; points: string; minPercent: string }

const toRows = (scale: GradeStep[]): Row[] => scale.map((step) => ({ letter: step.letter, points: String(step.points), minPercent: String(step.minPercent) }))

/** The grade scale: letters, grade points and % cut-offs (saved in the settings). */
export function GradeScaleEditor({ scale, curriculum }: { scale: GradeStep[]; curriculum?: CurriculumProfile }) {
  const profile = useProfile()
  const activeCurriculum = curriculum ?? curriculumForProfile(profile.data)
  const save = useSaveSettings()
  const [selectedCurriculumId, setSelectedCurriculumId] = useState(activeCurriculum.id)
  const [rows, setRows] = useState<Row[]>(() => toRows(scale))
  const [problems, setProblems] = useState<string[]>([])
  const [saved, setSaved] = useState(false)

  const change = (index: number, patch: Partial<Row>) => {
    setRows(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)))
    setSaved(false)
  }

  function submit(next: Row[], nextCurriculumId = selectedCurriculumId) {
    const steps: GradeStep[] = next.map((row) => ({ letter: row.letter.trim(), points: Number(row.points), minPercent: Number(row.minPercent) }))
    const issues = scaleProblems(steps)
    setProblems(issues)
    if (issues.length > 0) return
    save.mutate({ grades: { curriculum: nextCurriculumId, scale: steps } }, { onSuccess: () => setSaved(true) })
  }

  function switchCurriculum(nextId: string) {
    const nextProfile = getCurriculumProfile(nextId)
    setSelectedCurriculumId(nextProfile.id)
    const nextRows = toRows(nextProfile.defaultGradeScale)
    setRows(nextRows)
    submit(nextRows, nextProfile.id)
  }

  const chosen = getCurriculumProfile(selectedCurriculumId)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Grade scale &amp; curriculum</CardTitle>
        <CardDescription>
          Pick your grading system preset or customize letters, grade points, and percentage cut-offs.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-1.5">
          <label htmlFor="grade-curriculum" className="text-xs font-medium text-muted-foreground">
            Curriculum profile
          </label>
          <Select value={selectedCurriculumId} onValueChange={switchCurriculum}>
            <SelectTrigger id="grade-curriculum">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRICULUM_LIST.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{chosen.description}</p>
        </div>
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs text-muted-foreground">
          <span>Grade</span>
          <span>Points</span>
          <span>From %</span>
          <span className="w-7" />
        </div>
        {rows.map((row, index) => (
          <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
            <Input aria-label={`Grade ${index + 1}`} maxLength={4} value={row.letter} onChange={(event) => change(index, { letter: event.target.value })} />
            <Input aria-label={`Points for ${row.letter || `grade ${index + 1}`}`} type="number" inputMode="decimal" min={0} max={10} step="0.1" value={row.points} onChange={(event) => change(index, { points: event.target.value })} />
            <Input aria-label={`Lowest % for ${row.letter || `grade ${index + 1}`}`} type="number" inputMode="decimal" min={0} max={100} value={row.minPercent} onChange={(event) => change(index, { minPercent: event.target.value })} />
            <Button variant="ghost" size="icon-sm" aria-label={`Remove ${row.letter || `grade ${index + 1}`}`} onClick={() => setRows(rows.filter((_, at) => at !== index))}>
              <X aria-hidden />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => setRows([...rows, { letter: '', points: '0', minPercent: '0' }])}>
            <Plus aria-hidden />
            Add a grade
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const standard = toRows(chosen.defaultGradeScale)
              setRows(standard)
              submit(standard, chosen.id)
            }}
          >
            <RotateCcw aria-hidden />
            Reset to {chosen.shortLabel}
          </Button>
        </div>
        {(problems.length > 0 || save.error) && (
          <div role="alert" className="grid gap-1 text-sm text-destructive">
            {problems.map((problem) => (
              <p key={problem}>{problem}</p>
            ))}
            {save.error && <p>{save.error.message}</p>}
          </div>
        )}
        <div className="flex items-center gap-3">
          <Button variant="outline" disabled={save.isPending} onClick={() => submit(rows)}>
            {save.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
            Save scale
          </Button>
          {saved && (
            <span role="status" className="text-sm text-muted-foreground">
              Saved.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
