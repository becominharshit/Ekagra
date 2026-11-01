import { format } from 'date-fns'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCurrentBlock } from '@/features/mode/currentBlock'
import { MODE_LABEL } from '@/features/mode/modes'
import { DayTimeline } from '@/features/planner/DayTimeline'

const COMING = [
  { title: 'Now card with Start Focus, Done, Partial and Skip', when: 'M4' },
  { title: 'Capture tasks from text or a screenshot', when: 'M4' },
  { title: '"I Crashed" and the evening check-in', when: 'M4' },
  { title: 'Morning brief', when: 'M4' },
  { title: 'Pomodoro and Deep Work focus timer', when: 'M9' },
]

export function TodayPage() {
  const { block, now } = useCurrentBlock()

  return (
    <>
      <PageHeader title="Today" subtitle={format(now, 'EEEE, d MMMM')} />
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Now</CardTitle>
            <CardDescription>
              {block
                ? `${MODE_LABEL[block.mode]}: ${block.title}, until ${format(new Date(block.endsAt), 'h:mm a')}`
                : 'Nothing scheduled. You are in Free mode.'}
            </CardDescription>
          </CardHeader>
        </Card>

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
