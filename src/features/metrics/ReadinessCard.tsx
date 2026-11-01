import { format } from 'date-fns'
import { Timer } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Topic } from '@/features/academics/topicTree'
import { useLatestMocks } from '@/features/mock/mockTest'
import { cn } from '@/lib/utils'
import { examReadiness, percentText } from './readiness'

/** A thin bar for a share (0–1). */
export function ShareBar({ share, className }: { share: number; className?: string }) {
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-muted', className)} aria-hidden>
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%` }} />
    </div>
  )
}

/** Exam readiness on a subject's page: the score and its three parts. */
export function ReadinessCard({ subjectId, topics }: { subjectId: string; topics: Topic[] }) {
  const latest = useLatestMocks()
  const mock = latest.data?.get(subjectId) ?? null
  const readiness = examReadiness(topics, mock?.score ?? null)
  if (!readiness) return null
  const parts = [
    { label: 'Topics learned', detail: `${readiness.learnedTopics} of ${readiness.examTopics}, important ones count more`, share: readiness.coverage },
    { label: 'Mastery', detail: 'your latest check-quiz scores', share: readiness.mastery },
    { label: 'Latest mock test', detail: mock ? format(new Date(mock.startedAt), 'd MMM') : 'not taken yet', share: readiness.mock ?? 0 },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          Exam readiness
          <span className="tabular-nums">{percentText(readiness.score)}</span>
        </CardTitle>
        <CardDescription>40% topics learned, 40% mastery and 20% your latest mock test.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <ShareBar share={readiness.score} className="h-2" />
        <ul className="grid gap-1.5">
          {parts.map((part) => (
            <li key={part.label} className="flex items-baseline justify-between gap-2">
              <span>
                {part.label} <span className="text-xs text-muted-foreground">· {part.detail}</span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{percentText(part.share)}</span>
            </li>
          ))}
        </ul>
        {readiness.mock === null && (
          <Button asChild variant="outline" size="sm" className="justify-self-start">
            <Link to={`/academics/subjects/${subjectId}/mock`}>
              <Timer aria-hidden />
              Take a mock test: it's 20% of readiness
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
