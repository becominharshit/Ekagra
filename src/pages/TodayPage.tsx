import { format } from 'date-fns'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { activeBlock, MODE_LABEL } from '@/features/mode/modes'
import { useModeStore } from '@/features/mode/modeStore'
import { useNow } from '@/hooks/useNow'

const COMING = [
  { title: 'Now card from your real 14-day plan', when: 'M4' },
  { title: '"I Crashed" one-tap minimum day', when: 'M4' },
  { title: 'Evening energy check-in (1–5)', when: 'M4' },
  { title: 'Pomodoro and Deep Work focus timer', when: 'M9' },
]

export function TodayPage() {
  const now = useNow()
  const block = activeBlock(
    useModeStore((state) => state.block),
    now,
  )

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
