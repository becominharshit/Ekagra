import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const COMING = [
  { title: 'Templates: Freelancing, Content Creation, Startup, Custom', when: 'M8' },
  { title: 'Kanban pipeline board', when: 'M8' },
  { title: 'Clients, income and expenses', when: 'M8' },
  { title: 'Automatic earnings per hour', when: 'M8' },
  { title: 'Skill Bridge: "Learn this" creates a skill course', when: 'M8' },
  { title: 'AI task capture from screenshots or text', when: 'M8' },
]

export function HustlePage() {
  return (
    <>
      <PageHeader title="Hustle" subtitle="Your side hustles, clients and money." />
      <Card>
        <CardHeader>
          <CardTitle>Coming to Hustle</CardTitle>
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
