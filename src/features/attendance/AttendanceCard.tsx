import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { LoaderCircle, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Subject } from '@/features/academics/subjects'
import { useNow } from '@/hooks/useNow'
import { cn } from '@/lib/utils'
import { attendanceAdvice, hhmm, STATUS_LABEL, subjectAttendance, toStatus, type AttendanceStatus } from './attendance'
import { addClass, deleteAttendance, setAttendanceStatus, useAttendance, useAttendanceMutation, useAttendanceSettings, useClassSlots } from './attendanceData'
import { percentLabel, slotsLabel, STATE_TONE } from './labels'
import { StatusPicker } from './StatusPicker'

/** A subject's attendance: where it stands, what the rest of the semester allows, its class times and marks. */
export function AttendanceCard({ subject }: { subject: Subject }) {
  const now = useNow(60_000)
  const today = format(now, 'yyyy-MM-dd')
  const attendance = useAttendance()
  const slots = useClassSlots().filter((slot) => slot.subjectId === subject.id)
  const { minPercent, classesEndOn } = useAttendanceSettings()
  const [adding, setAdding] = useState(false)

  if (attendance.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Attendance</CardTitle>
          <CardDescription className="text-destructive">{attendance.error.message}</CardDescription>
        </CardHeader>
      </Card>
    )
  }
  if (!attendance.data) return null
  const summary = subjectAttendance({ subjectId: subject.id, rows: attendance.data, slots, minPercent, today, classesEndOn })
  const marks = attendance.data.filter((row) => row.subject_id === subject.id)
  const { outlook, remaining } = summary

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          Attendance
          <Badge variant="secondary" className={cn('text-sm', STATE_TONE[summary.state])}>
            {percentLabel(summary.percent)}
          </Badge>
        </CardTitle>
        <CardDescription>
          {summary.tally.held > 0 && `${summary.tally.attended} of ${summary.tally.held} classes. `}
          {attendanceAdvice(summary, minPercent)}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {outlook && remaining !== null && classesEndOn && (
          <p>
            {outlook.reachable
              ? `${remaining} ${remaining === 1 ? 'class' : 'classes'} left until ${format(parseISO(classesEndOn), 'd MMM')}: you can miss ${outlook.canMiss} of them and still finish at ${minPercent}% or above.`
              : `Even all ${remaining} classes left only take you to ${percentLabel(outlook.best)}. Talk to your class teacher about the shortage soon.`}
          </p>
        )}
        <p className="text-muted-foreground">
          {slots.length > 0 ? `Class times: ${slotsLabel(slots)}. ` : 'No class times yet, so Today can’t ask about this subject. '}
          <Link to="/onboarding?step=routine" className="underline underline-offset-3 hover:text-foreground">
            {slots.length > 0 ? 'Change them in your routine' : 'Set them in your routine'}
          </Link>
          {slots.length > 0 && !classesEndOn && (
            <>
              {' · '}
              <Link to="/academics/attendance" className="underline underline-offset-3 hover:text-foreground">
                Add the last day of classes
              </Link>{' '}
              to see how many of the rest you can miss.
            </>
          )}
        </p>

        {adding ? (
          <AddClassForm subjectId={subject.id} today={today} onDone={() => setAdding(false)} />
        ) : (
          <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            Add a class
          </Button>
        )}

        {marks.length > 0 && (
          <div className="grid gap-1.5">
            <h3 className="font-medium">Recent classes</h3>
            <ul className="grid gap-1">
              {marks.slice(0, 10).map((row) => (
                <MarkRow key={row.id} id={row.id} date={row.date} start={row.start_time} status={toStatus(row.status)} />
              ))}
            </ul>
            {marks.length > 10 && <p className="text-xs text-muted-foreground">And {marks.length - 10} earlier.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MarkRow({ id, date, start, status }: { id: string; date: string; start: string | null; status: AttendanceStatus | null }) {
  const change = useAttendanceMutation(setAttendanceStatus)
  const remove = useAttendanceMutation(deleteAttendance)
  const busy = change.isPending || remove.isPending

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-t pt-1.5">
      <span>
        {format(parseISO(date), 'EEE d MMM')}
        {start && <span className="text-muted-foreground"> · {hhmm(start)}</span>}
      </span>
      <span className="flex items-center gap-1">
        <StatusPicker
          compact
          value={status}
          disabled={busy}
          label={`Class on ${date}`}
          onChange={(next) => (next ? change.mutate({ id, status: next }) : remove.mutate(id))}
        />
        <Button variant="ghost" size="icon-sm" disabled={busy} aria-label={`Delete the class on ${date}`} onClick={() => remove.mutate(id)}>
          <Trash2 aria-hidden />
        </Button>
      </span>
    </li>
  )
}

/** A class that isn't in the routine, e.g. an extra lecture or one from before the class times were set. */
function AddClassForm({ subjectId, today, onDone }: { subjectId: string; today: string; onDone: () => void }) {
  const [date, setDate] = useState(today)
  const [status, setStatus] = useState<AttendanceStatus | null>('present')
  const add = useAttendanceMutation(addClass)

  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <Label className="grid gap-1.5 font-normal">
        <span className="text-muted-foreground">Date</span>
        <Input type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} />
      </Label>
      <StatusPicker value={status} label="How it went" onChange={setStatus} />
      {add.error && (
        <p role="alert" className="text-destructive">
          {add.error.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={!date || !status || add.isPending} onClick={() => status && add.mutate({ subjectId, date, status }, { onSuccess: onDone })}>
          {add.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
          Add {status ? STATUS_LABEL[status].toLowerCase() : ''} class
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
