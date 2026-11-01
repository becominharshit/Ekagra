import { format } from 'date-fns'
import { PageHeader } from '@/components/layout/PageHeader'
import { ClassesToday } from '@/features/attendance/ClassesToday'
import { ReviewTodayCard } from '@/features/review/ReviewNudges'
import { GroupFocusTodayCard } from '@/features/social/GroupFocusTodayCard'
import { NudgesCard } from '@/features/social/NudgesCard'
import { CrashButton, DayStatus } from '@/features/checkins/DayStatus'
import { EveningCheckIn } from '@/features/checkins/EveningCheckIn'
import { DayTimeline } from '@/features/planner/DayTimeline'
import { DueSoon } from '@/features/today/DueSoon'
import { MorningBrief } from '@/features/today/MorningBrief'
import { NowCard, UpNext } from '@/features/today/NowCard'
import { useNow } from '@/hooks/useNow'

export function TodayPage() {
  const now = useNow(60_000)

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="Today" subtitle={format(now, 'EEEE, d MMMM')} />
        <CrashButton />
      </div>
      <div className="grid gap-4">
        <DayStatus />
        <MorningBrief />
        <NowCard />
        <ReviewTodayCard />
        <NudgesCard />
        <GroupFocusTodayCard />
        <ClassesToday />
        <EveningCheckIn />
        <UpNext />
        <DueSoon />
        <DayTimeline />
      </div>
    </>
  )
}
