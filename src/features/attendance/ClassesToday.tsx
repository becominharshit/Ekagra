import { format } from 'date-fns'
import { Link } from 'react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSubjects } from '@/features/academics/subjects'
import { useNow } from '@/hooks/useNow'
import { attendanceAdvice, classesWithStatus, subjectAttendance } from './attendance'
import { markClass, unmarkClass, useAttendance, useAttendanceMutation, useAttendanceSettings, useClassSlots } from './attendanceData'
import { percentLabel } from './labels'
import { StatusPicker } from './StatusPicker'

/** Today: one tap per class from the routine (present, absent, cancelled), and subjects close to a shortage. */
export function ClassesToday() {
  const now = useNow(60_000)
  const today = format(now, 'yyyy-MM-dd')
  const attendance = useAttendance()
  const subjects = useSubjects()
  const slots = useClassSlots()
  const { minPercent, classesEndOn } = useAttendanceSettings()
  const mark = useAttendanceMutation(markClass)
  const unmark = useAttendanceMutation(unmarkClass)

  if (!attendance.data || !subjects.data) return null
  const rows = attendance.data
  const names = new Map(subjects.data.map((subject) => [subject.id, subject.name]))
  const classes = classesWithStatus(slots, rows, today)
  const watch = subjects.data
    .filter((subject) => subject.kind === 'course')
    .map((subject) => ({ subject, summary: subjectAttendance({ subjectId: subject.id, rows, slots, minPercent, today, classesEndOn }) }))
    .filter(({ summary }) => summary.state === 'short' || summary.state === 'low')
  if (classes.length === 0 && watch.length === 0) return null
  const busy = mark.isPending || unmark.isPending
  const problem = mark.error ?? unmark.error

  return (
    <Card>
      <CardHeader>
        <CardTitle>{classes.length > 0 ? 'Classes today' : 'Attendance'}</CardTitle>
        <CardDescription>
          {classes.length > 0 ? 'Mark each class after it ends: your attendance stays up to date.' : `Subjects close to the ${minPercent}% minimum.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {classes.length > 0 && (
          <ul className="grid gap-3">
            {classes.map(({ slot, status }) => {
              const name = names.get(slot.subjectId) ?? 'Class'
              return (
                <li key={`${slot.subjectId}-${slot.start}`} className="grid gap-1.5">
                  <p className="text-sm">
                    <span className="font-medium">{name}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      · {slot.start}–{slot.end}
                    </span>
                  </p>
                  <StatusPicker
                    value={status}
                    disabled={busy}
                    label={`Attendance for ${name} at ${slot.start}`}
                    onChange={(next) =>
                      next
                        ? mark.mutate({ subjectId: slot.subjectId, date: today, start: slot.start, status: next })
                        : unmark.mutate({ subjectId: slot.subjectId, date: today, start: slot.start })
                    }
                  />
                </li>
              )
            })}
          </ul>
        )}
        {watch.length > 0 && (
          <div className="grid gap-1.5 rounded-lg bg-muted/50 p-3 text-sm">
            {watch.map(({ subject, summary }) => (
              <p key={subject.id}>
                <Link to={`/academics/subjects/${subject.id}`} className="font-medium underline-offset-4 hover:underline">
                  {subject.name}
                </Link>{' '}
                {percentLabel(summary.percent)}: {attendanceAdvice(summary, minPercent)}
              </p>
            ))}
          </div>
        )}
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem.message}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
