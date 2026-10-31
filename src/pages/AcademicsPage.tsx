import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const COMING = [
  { title: 'Subjects and syllabus upload → exam and skill topic tree', when: 'M3' },
  { title: 'Past papers → topic priority', when: 'M3' },
  { title: 'PDF viewer with 1-click AI Anchors', when: 'M5' },
  { title: 'Lessons, check quizzes and flashcards', when: 'M6' },
  { title: 'Mistake notebook (1 → 3 → 7 days)', when: 'M6' },
  { title: 'Python Coding Lab', when: 'M7' },
]

export function AcademicsPage() {
  return (
    <>
      <PageHeader title="Academics" subtitle="Your subjects, materials and practice." />
      <Card>
        <CardHeader>
          <CardTitle>Coming to Academics</CardTitle>
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
