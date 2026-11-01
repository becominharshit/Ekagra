import { useEffect } from 'react'
import { addDays, differenceInCalendarDays, format } from 'date-fns'
import { CalendarCheck2 } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useNow } from '@/hooks/useNow'
import { focusGuard } from '@/lib/native/focusGuard'
import { useProfile } from '@/features/profile/queries'
import { readSettings } from '@/features/profile/settings'
import { useReview } from './reviewData'
import { nextReviewAt, reviewOffset, reviewWeekStart } from './weekStats'

const REMINDER_ID = 'weekly-review'

/** The week up for review now, and whether its review is finished. */
function useCurrentReview(now: Date) {
  const profile = useProfile()
  const { day, reminder } = readSettings(profile.data?.settings).review
  const weekStart = reviewWeekStart(now, day)
  const review = useReview(format(weekStart, 'yyyy-MM-dd'))
  return { profile, day, reminder, weekStart, review }
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

/** Android: a notification on the review day at 18:00 (none when it's turned off). Renders nothing. */
export function ReviewReminder() {
  const now = useNow(60 * 60_000)
  const { profile, day, reminder, review } = useCurrentReview(now)
  const ready = Boolean(profile.data?.onboarded_at) && !review.isPending
  const done = Boolean(review.data?.completed_at)
  const at = nextReviewAt(now, day, { doneThisWeek: done }).getTime()

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

  return null
}
