import { format } from 'date-fns'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DayTimeline } from '@/features/planner/DayTimeline'
import { DueSoon } from '@/features/today/DueSoon'
import { NowCard, UpNext } from '@/features/today/NowCard'
import { useNow } from '@/hooks/useNow'

const COMING = [
  { title: 'Capture tasks from text or a screenshot', when: 'M4' },
  { title: '"I Crashed" and the evening check-in', when: 'M4' },
  { title: 'Morning brief', when: 'M4' },
  { title: 'Pomodoro and Deep Work focus timer', when: 'M9' },
]

export function TodayPage() {
  const now = useNow(60_000)

  return (
    <>
      <PageHeader title="Today" subtitle={format(now, 'EEEE, d MMMM')} />
      <div className="grid gap-4">
        <NowCard />
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
