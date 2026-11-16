import { useEffect } from 'react'
import { addDays, differenceInCalendarDays, format } from 'date-fns'
import { CalendarCheck2 } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCheckIns } from '@/features/checkins/checkins'
import { localDateOf } from '@/features/planner/schedule'
import { useNow } from '@/hooks/useNow'
import { focusGuard } from '@/lib/native/focusGuard'
import { useProfile } from '@/features/profile/queries'
import { readSettings } from '@/features/profile/settings'
import { useReview } from './reviewData'
import { EVENING_REMINDER_HOUR, MORNING_REMINDER_HOUR, nextDailyReminderAt, nextReviewAt, reviewOffset, reviewWeekStart } from './weekStats'

const REMINDER_ID = 'weekly-review'
const MORNING_REMINDER_ID = 'morning-plan'
const EVENING_REMINDER_ID = 'evening-checkin'

/** The week up for review now, and whether its review is finished. */
function useCurrentReview(now: Date) {
  const profile = useProfile()
  const settings = readSettings(profile.data?.settings)
  const { day, reminder } = settings.review
  const { morningReminder, eveningReminder } = settings.planner
  const weekStart = reviewWeekStart(now, day)
  const review = useReview(format(weekStart, 'yyyy-MM-dd'))
  return { profile, day, reminder, morningReminder, eveningReminder, weekStart, review }
}

/** Today: from the review day (and the day after) until it's done, a card that opens the weekly review. */
export function ReviewTodayCard() {
  const now = useNow(60_000)
  const { profile, day, weekStart, review } = useCurrentReview(now)
  const daysSince = differenceInCalendarDays(now, addDays(weekStart, reviewOffset(day)))
  if (!profile.data?.onboarded_at || review.isPending || review.isError || review.data?.completed_at || daysSince > 1) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarCheck2 className="size-4" aria-hidden />
          Your weekly review is ready
        </CardTitle>
        <CardDescription>5 minutes: last week in numbers, 3 insights and up to 3 changes for next week.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link to="/me/review">{review.data ? 'Finish my review' : 'Start my review'}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

/** Android: notifications on the review day at 18:00, plus optional 08:00 morning plan and 21:00 evening check-in. Renders nothing. */
export function ReviewReminder() {
  const now = useNow(60 * 60_000)
  const today = localDateOf(now)
  const { profile, day, reminder, morningReminder, eveningReminder, review } = useCurrentReview(now)
  const checkIns = useCheckIns(today)
  const onboarded = Boolean(profile.data?.onboarded_at)
  const ready = onboarded && !review.isPending
  const done = Boolean(review.data?.completed_at)
  const checkedInToday = Boolean(checkIns.data?.some((row) => row.date === today && row.checked_in_at))
  const at = nextReviewAt(now, day, { doneThisWeek: done }).getTime()
  const morningAt = nextDailyReminderAt(now, MORNING_REMINDER_HOUR).getTime()
  const eveningAt = nextDailyReminderAt(now, EVENING_REMINDER_HOUR, { doneToday: checkedInToday }).getTime()

  useEffect(() => {
    if (!ready) return
    if (!reminder) {
      void focusGuard.cancelReminder(REMINDER_ID).catch(() => undefined)
      return
    }
    void focusGuard
      .scheduleReminder({ id: REMINDER_ID, at, title: 'Your weekly review is ready', body: '5 minutes: your week in numbers and 3 changes for next week.' })
      .catch(() => undefined)
  }, [ready, reminder, at])

  useEffect(() => {
    if (!onboarded) return
    if (!morningReminder) {
      void focusGuard.cancelReminder(MORNING_REMINDER_ID).catch(() => undefined)
      return
    }
    void focusGuard
      .scheduleReminder({
        id: MORNING_REMINDER_ID,
        at: morningAt,
        title: "Today's plan is ready",
        body: 'Open Ekagra to see your top study blocks and quick wins for today.',
      })
      .catch(() => undefined)
  }, [onboarded, morningReminder, morningAt])

  useEffect(() => {
    if (!onboarded) return
    if (!eveningReminder) {
      void focusGuard.cancelReminder(EVENING_REMINDER_ID).catch(() => undefined)
      return
    }
    void focusGuard
      .scheduleReminder({
        id: EVENING_REMINDER_ID,
        at: eveningAt,
        title: '1-minute evening check-in',
        body: "Log your energy and how today went so tomorrow's plan adjusts automatically.",
      })
      .catch(() => undefined)
  }, [onboarded, eveningReminder, eveningAt])

  return null
}

