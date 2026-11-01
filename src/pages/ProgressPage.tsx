import { format, parseISO } from 'date-fns'
import { ArrowLeft, LoaderCircle } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { minutesLabel } from '@/features/academics/labels'
import { useStudy } from '@/features/academics/roadmap'
import { ChallengeCard } from '@/features/metrics/ChallengeCard'
import { chartRange, type Range } from '@/features/metrics/chartMath'
import { TrendChart, WeekBars } from '@/features/metrics/charts'
import { METRIC_LABEL, METRICS, metricShortLabel, metricValueLabel, toMetric, weekPoints, type Metric, type WeekPoint } from '@/features/metrics/metrics'
import { useMetrics } from '@/features/metrics/metricsData'
import { examReadiness, percentText } from '@/features/metrics/readiness'
import { ShareBar } from '@/features/metrics/ReadinessCard'
import { useLatestMocks } from '@/features/mock/mockTest'

const METRIC_HELP: Record<Metric, string> = {
  memory: 'How much you still remember: flashcard reviews rated Good or Easy, and questions you got right again after a week. Aim for 85–90% (the green band); more costs too much review time.',
  learning_speed: 'Planned time ÷ the time you needed to learn a topic in your study blocks. 1.0× (the thin line) is as planned; more is faster.',
  processing_speed: 'Median seconds per right answer in quizzes, practice and mock tests. Lower is faster.',
  problem_solving: 'Your first-try score on new questions of medium difficulty or harder (harder ones count more).',
}

/** Shares stay between 0 and 100%. */
const SHARES = new Set<Metric>(['memory', 'problem_solving'])

/** 150 → "2.5 h", 45 → "45 min" (short, for a chart's axis). */
const shortMinutes = (minutes: number) => (minutes >= 60 ? `${Math.round(minutes / 6) / 10} h` : `${Math.round(minutes)} min`)

/** Academics → Progress (/academics/progress): the weekly challenge, exam readiness, the 4 metrics and focus time, week by week. */
export function ProgressPage() {
  const metrics = useMetrics()
  const view = metrics.data
  const points = view ? weekPoints(view.snapshots, view.thisWeek) : []
  const challenged = view?.challenge ? toMetric(view.challenge.metric) : null
  const firstLabel = points[0] ? format(parseISO(points[0].weekStart), 'd MMM') : ''

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link to="/academics">
          <ArrowLeft aria-hidden />
          Academics
        </Link>
      </Button>
      <PageHeader title="Progress" subtitle="How you learn, week by week: your weekly challenge, exam readiness and the 4 learning metrics." />
      <div className="grid gap-4">
        {metrics.isPending && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Working out your metrics…
          </p>
        )}
        {metrics.error && (
          <p role="alert" className="text-sm text-destructive">
            {metrics.error.message}
          </p>
        )}
        {view && <ChallengeCard view={view} />}
        <ReadinessList />
        {view && (
          <div className="grid gap-4 sm:grid-cols-2">
            {METRICS.map((metric) => (
              <MetricCard
                key={metric}
                metric={metric}
                points={points}
                target={metric === challenged && view.challenge ? Number(view.challenge.target) : undefined}
                firstLabel={firstLabel}
              />
            ))}
          </div>
        )}
        {view && <FocusCard points={points} firstLabel={firstLabel} />}
      </div>
    </>
  )
}

function MetricCard({ metric, points, target, firstLabel }: { metric: Metric; points: WeekPoint[]; target: number | undefined; firstLabel: string }) {
  const values = points.map((point) => point.values[metric])
  const known = values.filter((value): value is number => value !== null)
  const band: Range | undefined = metric === 'memory' ? [0.85, 0.9] : undefined
  const reference = metric === 'learning_speed' ? 1 : undefined
  const extra = [...(target !== undefined ? [target] : []), ...(band ?? []), ...(reference !== undefined ? [reference] : [])]
  const range = chartRange(values, SHARES.has(metric) ? { extra, floor: 0, ceiling: 1 } : { extra, floor: 0 })
  const first = known[0]
  const last = known[known.length - 1]
  const summary =
    first === undefined || last === undefined
      ? ''
      : known.length === 1
        ? `: ${metricShortLabel(metric, first)}`
        : `: from ${metricShortLabel(metric, first)} to ${metricShortLabel(metric, last)}`

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{METRIC_LABEL[metric]}</CardTitle>
        <CardDescription>
          This week so far: {metricValueLabel(metric, values[values.length - 1] ?? null)} · last week: {metricValueLabel(metric, values[values.length - 2] ?? null)}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {known.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not enough practice to measure yet.</p>
        ) : (
          <TrendChart
            label={`${METRIC_LABEL[metric]} over the last ${points.length} weeks${summary}`}
            values={values}
            range={range}
            format={(value) => metricShortLabel(metric, value)}
            liveLast
            target={target}
            band={band}
            reference={reference}
            firstLabel={firstLabel}
            lastLabel="This week"
          />
        )}
        <p className="text-xs text-muted-foreground">
          {METRIC_HELP[metric]}
          {target !== undefined && " The dashed line is this week's challenge target."}
        </p>
      </CardContent>
    </Card>
  )
}

function FocusCard({ points, firstLabel }: { points: WeekPoint[]; firstLabel: string }) {
  const values = points.map((point) => point.focusMinutes)
  const total = values.reduce((sum, minutes) => sum + minutes, 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Focus time</CardTitle>
        <CardDescription>Minutes in focus sessions each week. This week so far: {minutesLabel(values[values.length - 1] ?? 0)}.</CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">No focus sessions in these weeks yet.</p>
        ) : (
          <WeekBars
            label={`Focus time over the last ${points.length} weeks: ${minutesLabel(total)} in all`}
            values={values}
            format={shortMinutes}
            liveLast
            firstLabel={firstLabel}
            lastLabel="This week"
          />
        )}
      </CardContent>
    </Card>
  )
}

/** Every course subject's exam readiness. */
function ReadinessList() {
  const study = useStudy()
  const mocks = useLatestMocks()
  const data = study.data
  if (!data) return null
  const rows = data.subjects
    .filter((subject) => subject.kind === 'course')
    .flatMap((subject) => {
      const readiness = examReadiness(
        data.topics.filter((topic) => topic.subject_id === subject.id),
        mocks.data?.get(subject.id)?.score ?? null,
      )
      return readiness ? [{ subject, readiness }] : []
    })
  if (rows.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Exam readiness</CardTitle>
        <CardDescription>40% topics learned, 40% mastery and 20% your latest mock test.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 text-sm">
          {rows.map(({ subject, readiness }) => (
            <li key={subject.id} className="grid gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <Link to={`/academics/subjects/${subject.id}`} className="min-w-0 truncate underline-offset-4 hover:underline">
                  {subject.name}
                </Link>
                <span className="shrink-0 tabular-nums">{percentText(readiness.score)}</span>
              </div>
              <ShareBar share={readiness.score} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
