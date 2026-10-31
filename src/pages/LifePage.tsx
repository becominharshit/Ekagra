import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const COMING = [
  { title: 'Your routine: sleep, classes, gym, meals', when: 'M2' },
  { title: 'Evening energy check-in (1–5)', when: 'M4' },
  { title: 'Habits and the full Life section', when: 'Phase 2' },
]

export function LifePage() {
  return (
    <>
      <PageHeader title="Life" subtitle="Sleep, health and energy." />
      <Card>
        <CardHeader>
          <CardTitle>Coming to Life</CardTitle>
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
    </>
  )
}
