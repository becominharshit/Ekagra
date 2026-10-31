import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ModeSimulator } from '@/features/mode/ModeSimulator'

const COMING = [
  { title: 'Google sign-in', when: 'M2' },
  { title: 'Profile, routine and time budget (55 / 25 / 20)', when: 'M2' },
  { title: 'FocusGuard setup and blocked apps', when: 'M9' },
]

export function MePage() {
  return (
    <>
      <PageHeader title="Me" subtitle="Your profile and settings." />
      <div className="grid gap-4">
        <ModeSimulator />

        <Card>
          <CardHeader>
            <CardTitle>Coming to Me</CardTitle>
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
