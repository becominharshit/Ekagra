import { format } from 'date-fns'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CrashButton, DayStatus } from '@/features/checkins/DayStatus'
import { EveningCheckIn } from '@/features/checkins/EveningCheckIn'
import { DayTimeline } from '@/features/planner/DayTimeline'
import { DueSoon } from '@/features/today/DueSoon'
import { NowCard, UpNext } from '@/features/today/NowCard'
import { useNow } from '@/hooks/useNow'

const COMING = [
  { title: 'Morning brief', when: 'M4' },
  { title: 'Pomodoro and Deep Work focus timer', when: 'M9' },
]

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
        <NowCard />
        <EveningCheckIn />
        <UpNext />
        <DueSoon />
        <DayTimeline />

        <Card>
          <CardHeader>
            <CardTitle>Coming to Today</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2">
              {COMING.map((item) => (
                <li key={item.title} className="flex items-center justify-between gap-3">
                  <span>{item.title}</span>
                  <Badge variant="secondary">{item.when}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
