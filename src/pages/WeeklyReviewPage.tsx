import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addDays, format, parseISO } from 'date-fns'
import { ArrowLeft, CheckCircle2, LoaderCircle, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useSubjects } from '@/features/academics/subjects'
import { METRIC_LABEL, METRICS, metricValueLabel, toMetric, type MetricValues } from '@/features/metrics/metrics'
import { setWeekChallenge, useChallenges, metricsKey } from '@/features/metrics/metricsData'
import { DEFAULT_SKILL_WEEKLY_MINUTES } from '@/features/planner/studyData'
import { useProfile, useSaveSettings } from '@/features/profile/queries'
import { peakWindowFor, readSettings, toChronotype, toMentorTone, type Settings } from '@/features/profile/settings'
import { ChangeCard } from '@/features/review/ChangeCard'
import { readReviewChanges, type ChangeContext } from '@/features/review/changes'
import { useApplyReviewChange, useMakeReview, useReview, useUpdateReview, withChange, type WeeklyReview } from '@/features/review/reviewData'
import { SleepAndStudy } from '@/features/review/SleepAndStudy'
import { readWeekStats, reviewWeekStart } from '@/features/review/weekStats'
import { WeekNumbers } from '@/features/review/WeekNumbers'
import { useNow } from '@/hooks/useNow'
import { need, useDataSource } from '@/lib/dataSource'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** "2–8 Nov", or "26 Oct – 1 Nov" across two months. */
function weekLabel(weekStart: Date): string {
  const end = addDays(weekStart, 6)
  return weekStart.getMonth() === end.getMonth() ? `${format(weekStart, 'd')}–${format(end, 'd MMM')}` : `${format(weekStart, 'd MMM')} – ${format(end, 'd MMM')}`
}

/** Me → Weekly review (/me/review): every Sunday (or the day picked), 5 minutes about the week that's ending. */
export function WeeklyReviewPage() {
  const now = useNow(60_000)
  const profile = useProfile()
  const subjects = useSubjects()
  const settings = readSettings(profile.data?.settings)
  const weekStart = reviewWeekStart(now, settings.review.day)
  const review = useReview(format(weekStart, 'yyyy-MM-dd'))
  const make = useMakeReview()
  const { source } = useDataSource()

  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
      <Link to="/me">
        <ArrowLeft aria-hidden />
        Me
      </Link>
    </Button>
  )
  const loading = profile.isPending || subjects.isPending || review.isPending
  const problem = profile.error ?? subjects.error ?? review.error

  function start() {
    make.mutate({
      weekStart,
      setup: {
        settings,
        subjects: subjects.data ?? [],
        mentorTone: toMentorTone(profile.data?.mentor_tone),
        peak: peakWindowFor(settings, toChronotype(profile.data?.chronotype)),
        today: format(now, 'yyyy-MM-dd'),
      },
    })
  }

  return (
    <>
      {back}
      <PageHeader title="Weekly review" subtitle={`The week of ${weekLabel(weekStart)}: what happened, and what to change for next week.`} />
      <div className="grid gap-4">
        {loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Loading…
          </p>
        )}
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem.message}
          </p>
        )}
        {!loading && !problem && !review.data && (
          <Card>
            <CardHeader>
              <CardTitle>Your review is ready to make</CardTitle>
              <CardDescription>
                5 minutes: your week in numbers, 3 insights and up to 3 changes for next week that you can apply in one tap.{' '}
                {source?.kind === 'supabase' ? 'The AI writes it from your numbers.' : 'In Demo Mode your device writes it from your numbers.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {make.error && (
                <p role="alert" className="text-sm text-destructive">
                  {make.error.message}
                </p>
              )}
              <Button className="justify-self-start" disabled={make.isPending} onClick={start}>
                {make.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
                {make.isPending ? 'Looking at your week…' : 'Make my review'}
              </Button>
            </CardContent>
          </Card>
        )}
        {review.data && (
          <ReviewView
            review={review.data}
            settings={settings}
            ctxBase={{
              settings,
              subjects: new Map((subjects.data ?? []).map((subject) => [subject.id, { name: subject.name, kind: subject.kind, weeklyMinutes: subject.weekly_minutes_limit, examDate: subject.exam_date }])),
              peak: peakWindowFor(settings, toChronotype(profile.data?.chronotype)),
              defaultSkillMinutes: DEFAULT_SKILL_WEEKLY_MINUTES,
            }}
            aiError={make.data?.review.id === review.data.id ? make.data.aiError : null}
            canAskAi={source?.kind === 'supabase'}
            remaking={make.isPending}
            onRemake={start}
          />
        )}
        <ReviewSettings settings={settings} />
      </div>
    </>
  )
}

function ReviewView({
  review,
  settings,
  ctxBase,
  aiError,
  canAskAi,
  remaking,
  onRemake,
}: {
  review: WeeklyReview
  settings: Settings
  ctxBase: Omit<ChangeContext, 'metrics'>
  aiError: string | null
  canAskAi: boolean
  remaking: boolean
  onRemake: () => void
}) {
  const apply = useApplyReviewChange()
  const update = useUpdateReview()
  const stats = readWeekStats(review.stats)
  const insights = Array.isArray(review.insights) ? review.insights.filter((insight): insight is string => typeof insight === 'string') : []
  const changes = readReviewChanges(review.changes)
  const ctx: ChangeContext = { ...ctxBase, metrics: stats?.metrics ?? null }
  const busy = apply.isPending || update.isPending
  const problem = apply.error ?? update.error

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Your week in numbers</CardTitle>
          <CardDescription>
            {review.source === 'ai' ? 'Insights and changes written by the AI from these numbers.' : 'Insights and changes written on your device from these numbers.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {aiError && <p className="rounded-lg bg-muted/50 p-3 text-sm">The AI couldn't write the review ({aiError}), so your device wrote it from your numbers.</p>}
          {stats ? <WeekNumbers stats={stats} /> : <p className="text-sm text-muted-foreground">The numbers of this review couldn't be read.</p>}
        </CardContent>
      </Card>

      {stats && <SleepAndStudy sleep={stats.sleep} />}

      <Card>
        <CardHeader>
          <CardTitle>What to notice</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid list-disc gap-1.5 pl-5 text-sm">
            {insights.map((insight) => (
              <li key={insight}>{insight}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Changes for next week</CardTitle>
          <CardDescription>{changes.length > 0 ? 'Apply the ones you like (change the numbers first if you want), skip the others.' : 'Nothing to change: keep going as you are.'}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {changes.map((change, index) => (
            <ChangeCard
              key={`${review.id}-${index}`}
              change={change}
              ctx={ctx}
              busy={busy}
              onApply={(edited) => apply.mutate({ review, index, change: edited, settings })}
              onSkip={() => update.mutate({ id: review.id, patch: { changes: withChange(review, index, change, 'skipped') } })}
              onReopen={() => update.mutate({ id: review.id, patch: { changes: withChange(review, index, change, 'open') } })}
            />
          ))}
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {problem.message}
            </p>
          )}
        </CardContent>
      </Card>

      <NextChallenge review={review} metrics={stats?.metrics ?? null} />

      <Card>
        <CardContent className="grid gap-3">
          {review.completed_at ? (
            <p role="status" className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4 text-mode-life" aria-hidden />
              Review done. See you next {DAY_NAMES[settings.review.day]}.
            </p>
          ) : (
            <Button className="justify-self-start" disabled={busy} onClick={() => update.mutate({ id: review.id, patch: { completed_at: new Date().toISOString() } })}>
              <CheckCircle2 aria-hidden />
              Finish the review
            </Button>
          )}
          {canAskAi && review.source === 'device' && (
            <Button variant="outline" className="justify-self-start" disabled={remaking} onClick={onRemake}>
              {remaking ? <LoaderCircle className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
              Ask the AI again
            </Button>
          )}
        </CardContent>
      </Card>
    </>
  )
}

/** Next week's challenge: the one set for it, or pick a metric that was measured this week. */
function NextChallenge({ review, metrics }: { review: WeeklyReview; metrics: MetricValues | null }) {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  const challenges = useChallenges()
  const nextWeek = format(addDays(parseISO(review.week_start), 7), 'yyyy-MM-dd')
  const set = challenges.data?.find((row) => row.week_start === nextWeek) ?? null
  const pick = useMutation({
    mutationFn: ({ metric, baseline }: { metric: (typeof METRICS)[number]; baseline: number }) => setWeekChallenge(need(source), { weekStart: nextWeek, metric, baseline }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: metricsKey(owner) }),
  })
  const setMetric = set ? toMetric(set.metric) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Next week's challenge</CardTitle>
        <CardDescription>
          {set && setMetric
            ? `${METRIC_LABEL[setMetric]}: target ${metricValueLabel(setMetric, Number(set.target))}.`
            : "Pick a metric, or the app picks on Monday from this week's results."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Metric for next week">
          {METRICS.map((metric) => {
            const baseline = metrics?.[metric] ?? null
            return (
              <Button
                key={metric}
                size="sm"
                variant={metric === setMetric ? 'secondary' : 'outline'}
                aria-pressed={metric === setMetric}
                disabled={baseline === null || pick.isPending || set?.achieved != null}
                onClick={() => baseline !== null && pick.mutate({ metric, baseline })}
              >
                {METRIC_LABEL[metric]}
              </Button>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">Only metrics measured this week can be picked; the target starts 5% better than this week.</p>
        {pick.error && (
          <p role="alert" className="text-sm text-destructive">
            {pick.error.message}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/** The review day and the Android reminder. */
function ReviewSettings({ settings }: { settings: Settings }) {
  const save = useSaveSettings()
  const { day, reminder } = settings.review

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Review day</CardTitle>
        <CardDescription>The review is about the week ending then; until the next one, last week's waits here.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Review day">
          {DAY_NAMES.map((name, index) => (
            <Button key={name} size="sm" variant={index === day ? 'secondary' : 'outline'} aria-pressed={index === day} disabled={save.isPending} onClick={() => save.mutate({ review: { day: index, reminder } })}>
              {name.slice(0, 3)}
            </Button>
          ))}
        </div>
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox checked={reminder} disabled={save.isPending} onCheckedChange={(checked) => save.mutate({ review: { day, reminder: checked === true } })} />
          Remind me at 18:00 on that day (Android app)
        </Label>
        {save.error && (
          <p role="alert" className="text-sm text-destructive">
            {save.error.message}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
