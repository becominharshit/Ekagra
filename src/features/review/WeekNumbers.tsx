import { countLabel, minutesLabel } from '@/features/academics/labels'
import { METRIC_LABEL, METRICS, metricValueLabel } from '@/features/metrics/metrics'
import type { Area } from '@/features/planner/types'
import type { WeekStats } from './weekStats'

const AREAS: { area: Area; label: string }[] = [
  { area: 'academics', label: 'Academics' },
  { area: 'hustle', label: 'Hustle' },
  { area: 'life', label: 'Life' },
]

const percent = (share: number | null) => (share === null ? '–' : `${Math.round(share * 100)}%`)

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}

/** The week in numbers: time per area against the budget, then the rest in small tiles. */
export function WeekNumbers({ stats }: { stats: WeekStats }) {
  const finished = stats.blocks.done + stats.blocks.partial + stats.blocks.missed
  const app = stats.distractions.topApps[0]
  const hour = stats.distractions.topHours[0]
  const tiles = [
    { label: 'Blocks done', value: finished > 0 ? `${stats.blocks.done} of ${finished}` : '–', note: finished > 0 ? `${stats.blocks.partial} cut short, ${stats.blocks.missed} missed` : 'Nothing finished yet' },
    { label: 'Focus', value: minutesLabel(stats.focus.minutes), note: countLabel(stats.focus.sessions, 'session') },
    { label: 'Quiz accuracy', value: percent(stats.quiz.accuracy), note: countLabel(stats.quiz.attempts, 'answer') },
    { label: 'Flashcards remembered', value: percent(stats.reviews.retention), note: countLabel(stats.reviews.count, 'review') },
    {
      label: 'Topics learned',
      value: String(stats.topicsLearned.length),
      note:
        stats.topicsLearned
          .slice(0, 2)
          .map((topic) => topic.title)
          .join(', ') || 'None this week',
    },
    {
      label: 'Distractions',
      value: String(stats.distractions.total),
      note: app ? `Mostly ${app.app}${hour ? `, around ${String(hour.hour).padStart(2, '0')}:00` : ''}` : stats.distractions.total === 0 ? 'None noted' : '',
    },
    { label: 'Energy', value: stats.checkIns.energy === null ? '–' : `${stats.checkIns.energy}/5`, note: countLabel(stats.checkIns.days, 'check-in') },
    { label: 'Tasks done', value: String(stats.tasks.completed), note: stats.tasks.overdue > 0 ? `${stats.tasks.overdue} overdue` : 'None overdue' },
    ...(stats.hustle.minutes > 0 || stats.hustle.income.length > 0
      ? [
          {
            label: 'Hustle',
            value: minutesLabel(stats.hustle.minutes),
            note: stats.hustle.income.length > 0 ? `Earned ${stats.hustle.income.map((income) => money(income.amount, income.currency)).join(' + ')}` : 'No income noted',
          },
        ]
      : []),
  ]

  return (
    <div className="grid gap-4 text-sm">
      <div className="grid gap-2.5">
        {AREAS.map(({ area, label }) => {
          const row = stats.areas[area]
          return (
            <div key={area} className="grid gap-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="font-medium">{label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {minutesLabel(row.done)} of {minutesLabel(row.planned)} planned · {row.sharePct}% of your time (plan {row.budgetPct}%)
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-primary" style={{ width: `${row.planned > 0 ? Math.min(100, Math.round((row.done / row.planned) * 100)) : 0}%` }} />
              </div>
            </div>
          )
        })}
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="grid gap-0.5 rounded-lg bg-muted/40 p-2.5">
            <dt className="text-xs text-muted-foreground">{tile.label}</dt>
            <dd className="font-heading text-lg font-semibold tabular-nums">{tile.value}</dd>
            {tile.note && <dd className="truncate text-xs text-muted-foreground">{tile.note}</dd>}
          </div>
        ))}
      </dl>
      {stats.metrics && (
        <p className="text-xs text-muted-foreground">
          {METRICS.map((metric) => `${METRIC_LABEL[metric]} ${metricValueLabel(metric, stats.metrics?.[metric] ?? null)}`).join(' · ')}
        </p>
      )}
    </div>
  )
}
