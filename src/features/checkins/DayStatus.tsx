import { BatteryLow, ShieldCheck, Undo2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { localDateOf } from '@/features/planner/schedule'
import { useTodayMutation } from '@/features/today/todayMutation'
import { useNow } from '@/hooks/useNow'
import { crashToday, guardOn, undoCrash, useCheckIns } from './checkins'

/** "I crashed": one tap (and a confirm) turns today into a minimum day. The plan keeper then re-plans. */
export function CrashButton() {
  const today = localDateOf(useNow(60_000))
  const checkIns = useCheckIns(today)
  const crash = useTodayMutation(crashToday)
  const row = checkIns.data?.find((checkIn) => checkIn.date === today)
  // Not needed on a day that is already a minimum day, or once the day is checked in.
  if (!checkIns.data || row?.minimum_day || row?.checked_in_at) return null

  return (
    <div className="grid justify-items-end gap-1">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={crash.isPending}>
            <BatteryLow aria-hidden />I crashed
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rough day?</AlertDialogTitle>
            <AlertDialogDescription>
              Today shrinks to your most important block (up to 30 minutes) and up to 15 minutes of reviews. Everything else moves
              to the next days, which grow by at most 20%. You can undo this today.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my plan</AlertDialogCancel>
            <AlertDialogAction onClick={() => crash.mutate(new Date())}>Shrink today</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {crash.error && (
        <p role="alert" className="text-xs text-destructive">
          {crash.error.message}
        </p>
      )}
    </div>
  )
}

/** Notes about how today is planned: a minimum day (with Undo) and the Burnout Guard. */
export function DayStatus() {
  const today = localDateOf(useNow(60_000))
  const checkIns = useCheckIns(today)
  const undo = useTodayMutation(undoCrash)
  const rows = checkIns.data ?? []
  const minimumDay = rows.some((row) => row.date === today && row.minimum_day)
  const guard = guardOn(today, rows)

  return (
    <>
      {minimumDay && (
        <Card size="sm" className="bg-amber-500/10 ring-amber-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BatteryLow className="size-4" aria-hidden />
              Minimum day
            </CardTitle>
            <CardDescription>Just your most important block and a few reviews today. The rest moved to the next days.</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" disabled={undo.isPending} onClick={() => undo.mutate(today)}>
                <Undo2 aria-hidden />
                Undo
              </Button>
            </CardAction>
            {undo.error && (
              <p role="alert" className="text-sm text-destructive">
                {undo.error.message}
              </p>
            )}
          </CardHeader>
        </Card>
      )}
      {guard && (
        <Card size="sm" className="bg-sky-500/10 ring-sky-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4" aria-hidden />
              Burnout Guard is on
            </CardTitle>
            <CardDescription>Your last 3 check-ins had low energy, so today's plan is 30% lighter. Rest is part of the plan too.</CardDescription>
          </CardHeader>
        </Card>
      )}
    </>
  )
}
