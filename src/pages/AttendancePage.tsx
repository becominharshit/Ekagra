import { useState, type FormEvent } from 'react'
import { format, parseISO } from 'date-fns'
import { ArrowLeft, ChevronRight, LoaderCircle } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSubjects } from '@/features/academics/subjects'
import { attendanceAdvice, subjectAttendance } from '@/features/attendance/attendance'
import { useAttendance, useAttendanceSettings, useClassSlots } from '@/features/attendance/attendanceData'
import { percentLabel, slotsLabel, STATE_LABEL, STATE_TONE } from '@/features/attendance/labels'
import { useSaveSettings } from '@/features/profile/queries'
import { useNow } from '@/hooks/useNow'

/** Academics → Attendance (/academics/attendance): every subject against the minimum, and the settings. */
export function AttendancePage() {
  const now = useNow(60_000)
  const today = format(now, 'yyyy-MM-dd')
  const subjects = useSubjects()
  const attendance = useAttendance()
  const slots = useClassSlots()
  const { minPercent, classesEndOn } = useAttendanceSettings()
  const courses = (subjects.data ?? []).filter((subject) => subject.kind === 'course')

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link to="/academics">
          <ArrowLeft aria-hidden />
          Academics
        </Link>
      </Button>
      <PageHeader title="Attendance" subtitle={`Each subject against your college's ${minPercent}% minimum.`} />
      <div className="grid gap-4">
        {(subjects.isPending || attendance.isPending) && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Loading…
          </p>
        )}
        {(subjects.error ?? attendance.error) && (
          <p role="alert" className="text-sm text-destructive">
            {(subjects.error ?? attendance.error)?.message}
          </p>
        )}
        {subjects.data && courses.length === 0 && <p className="text-sm text-muted-foreground">Add your subjects in Academics first.</p>}

        {attendance.data &&
          courses.map((subject) => {
            const own = slots.filter((slot) => slot.subjectId === subject.id)
            const summary = subjectAttendance({ subjectId: subject.id, rows: attendance.data, slots: own, minPercent, today, classesEndOn })
            return (
              <Link
                key={subject.id}
                to={`/academics/subjects/${subject.id}`}
                className="rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <Card className="transition-colors hover:bg-muted/40">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">{subject.name}</span>
                      <Badge variant="secondary" className={STATE_TONE[summary.state]}>
                        {summary.state === 'none' ? STATE_LABEL.none : percentLabel(summary.percent)}
                      </Badge>
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    </CardTitle>
                    <CardDescription>
                      {summary.tally.held > 0 && `${summary.tally.attended} of ${summary.tally.held}. `}
                      {attendanceAdvice(summary, minPercent)}
                      {summary.outlook && (summary.outlook.reachable ? ` This semester: ${summary.outlook.canMiss} of the ${summary.remaining} classes left can be missed.` : ' Even every class left isn’t enough.')}
                    </CardDescription>
                    <p className="text-xs text-muted-foreground">{own.length > 0 ? slotsLabel(own) : 'No class times in the routine'}</p>
                  </CardHeader>
                </Card>
              </Link>
            )
          })}

        <AttendanceSettings minPercent={minPercent} classesEndOn={classesEndOn} />

        <Card>
          <CardHeader>
            <CardTitle>How Today asks</CardTitle>
            <CardDescription>
              Every class time in your routine that names its subject shows on Today: tap Present, Absent or Cancelled after the class. Cancelled
              classes don't count. Classes outside the routine can be added on the subject's page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/onboarding?step=routine">Set class times in your routine</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function AttendanceSettings({ minPercent, classesEndOn }: { minPercent: number; classesEndOn: string | null }) {
  const save = useSaveSettings()
  const [minimum, setMinimum] = useState(String(minPercent))
  const [endOn, setEndOn] = useState(classesEndOn ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function submit(event: FormEvent) {
    event.preventDefault()
    const value = Number(minimum)
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      setProblem('The minimum is a whole number from 1 to 100.')
      return
    }
    setProblem(null)
    save.mutate({ attendance: { minPercent: value, classesEndOn: endOn || null } }, { onSuccess: () => setSaved(true) })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>
          The last day of classes (before exams) lets the app count the classes left{classesEndOn ? `: now ${format(parseISO(classesEndOn), 'd MMMM yyyy')}` : ''}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3">
            <Label className="grid gap-1.5 font-normal">
              <span className="text-sm text-muted-foreground">Minimum attendance (%)</span>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                value={minimum}
                onChange={(event) => {
                  setMinimum(event.target.value)
                  setSaved(false)
                }}
              />
            </Label>
            <Label className="grid gap-1.5 font-normal">
              <span className="text-sm text-muted-foreground">Last day of classes</span>
              <Input
                type="date"
                value={endOn}
                onChange={(event) => {
                  setEndOn(event.target.value)
                  setSaved(false)
                }}
              />
            </Label>
          </div>
          {(problem ?? save.error) && (
            <p role="alert" className="text-sm text-destructive">
              {problem ?? save.error?.message}
            </p>
          )}
          <div className="flex items-center gap-3">
            <Button type="submit" variant="outline" disabled={save.isPending}>
              {save.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
              Save
            </Button>
            {saved && (
              <span role="status" className="text-sm text-muted-foreground">
                Saved.
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
