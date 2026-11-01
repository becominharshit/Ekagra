import { format, parseISO } from 'date-fns'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CHALLENGE_TIP, challengeGoal, isOnTarget } from './challenge'
import { METRIC_LABEL, METRICS, metricValueLabel, snapshotValues, toMetric, weekValues } from './metrics'
import { useChangeChallenge, type MetricsView } from './metricsData'

/** This week's challenge: the goal, how the week is going, the last results, and picking another metric. */
export function ChallengeCard({ view }: { view: MetricsView }) {
  const change = useChangeChallenge()
  const { challenge, challenges, snapshots, thisWeek } = view

  if (!challenge) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Weekly challenge</CardTitle>
          <CardDescription>
            Your first challenge comes once a week of practice can be measured: review flashcards, practise questions and finish topics. Every Monday
            brings a new one.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const metric = toMetric(challenge.metric)
  const target = Number(challenge.target)
  const soFar = weekValues(thisWeek)[metric]
  const lastSnapshot = snapshots[snapshots.length - 1]
  const latest = lastSnapshot ? snapshotValues(lastSnapshot) : null
  const recent = challenges.slice(-4).reverse()

  return (
    <Card>
      <CardHeader>
        <CardTitle>This week's challenge</CardTitle>
        <CardDescription>
          {METRIC_LABEL[metric]}: {challengeGoal(metric, target)}.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <p>
          So far this week: <span className="font-medium">{soFar === null ? 'not enough practice to measure yet' : metricValueLabel(metric, soFar)}</span>
          {soFar !== null && (isOnTarget(metric, soFar, target) ? <span className="text-mode-life"> · on target</span> : <span className="text-muted-foreground"> · not there yet</span>)}
          {challenge.baseline !== null && <span className="text-muted-foreground"> (last measured: {metricValueLabel(metric, Number(challenge.baseline))})</span>}
        </p>
        <p className="text-muted-foreground">{CHALLENGE_TIP[metric]}</p>

        {recent.length > 0 && (
          <ul className="grid gap-1">
            {recent.map((row) => {
              const rowMetric = toMetric(row.metric)
              return (
                <li key={row.id} className="flex items-center gap-2">
                  {row.achieved ? <Check className="size-4 shrink-0 text-mode-life" aria-label="On target" /> : <X className="size-4 shrink-0 text-destructive" aria-label="Missed" />}
                  <span>
                    Week of {format(parseISO(row.week_start), 'd MMM')}: {METRIC_LABEL[rowMetric]}, target {metricValueLabel(rowMetric, Number(row.target))}
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        <div className="grid gap-1.5">
          <p className="text-xs text-muted-foreground">Challenge another metric instead (its target starts 5% better than last measured):</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Metric to challenge">
            {METRICS.map((one) => {
              const baseline = latest?.[one] ?? null
              return (
                <Button
                  key={one}
                  size="sm"
                  variant={one === metric ? 'secondary' : 'outline'}
                  aria-pressed={one === metric}
                  disabled={one === metric || baseline === null || change.isPending}
                  onClick={() => {
                    if (baseline !== null) change.mutate({ id: challenge.id, metric: one, baseline })
                  }}
                >
                  {METRIC_LABEL[one]}
                </Button>
              )
            })}
          </div>
          {change.error && (
            <p role="alert" className="text-destructive">
              {change.error.message}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
