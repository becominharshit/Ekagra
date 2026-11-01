import { format } from 'date-fns'
import { DEFAULT_AI_LIMITS } from '@shared/schemas.ts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatUsd, useAiUsage, type AiUsageView } from './usage'

/** Me → AI usage: today's requests against the daily limit, and this month's cost per AI feature. */
export function AiUsageCard() {
  const usage = useAiUsage()

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI usage</CardTitle>
        <CardDescription>Your AI requests and what they cost. The limits keep the app within its AI budget.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {usage.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : usage.error ? (
          <p role="alert" className="text-sm text-destructive">
            {usage.error.message}
          </p>
        ) : usage.data.kind === 'demo' ? (
          <p className="text-sm text-muted-foreground">
            Demo Mode makes its sample AI answers on this device, so nothing is sent to the AI, counted or paid. Signed in, each student
            gets {DEFAULT_AI_LIMITS.userDailyRequests} AI requests a day, and the whole app shares a ${DEFAULT_AI_LIMITS.monthlyBudgetUsd} monthly AI
            budget.
          </p>
        ) : (
          <SignedInUsage view={usage.data} />
        )}
      </CardContent>
    </Card>
  )
}

function SignedInUsage({ view }: { view: Extract<AiUsageView, { kind: 'signed_in' }> }) {
  const { summary, limits, app } = view

  return (
    <>
      <section className="grid gap-2" aria-label="Today">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-medium">Today (last 24 hours)</h3>
          <span className="text-sm tabular-nums">
            {summary.day} of {limits.userDailyRequests} requests
          </span>
        </div>
        <UsageBar label="AI requests in the last 24 hours" value={summary.day} max={limits.userDailyRequests} />
        {summary.nextFreeAt && (
          <p className="text-sm text-muted-foreground">You've used today's requests. The next one frees up at {format(summary.nextFreeAt, 'h:mm a')}.</p>
        )}
      </section>

      <section className="grid gap-2" aria-label="This month">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-medium">This month (since {format(view.monthStart, 'd MMM')})</h3>
          <span className="text-sm tabular-nums">
            {summary.month} {summary.month === 1 ? 'request' : 'requests'} · {formatUsd(summary.monthUsd)}
          </span>
        </div>
        {app && app.spentThisMonthUsd !== null && (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm text-muted-foreground">
              <span>The whole app</span>
              <span className="tabular-nums">
                {formatUsd(app.spentThisMonthUsd)} of ${limits.monthlyBudgetUsd.toFixed(2)}
              </span>
            </div>
            <UsageBar label="The app's AI spending this month" value={app.spentThisMonthUsd} max={limits.monthlyBudgetUsd} />
          </>
        )}
        {app && app.spentLast24hUsd !== null && (
          <p className="text-sm text-muted-foreground">
            In the last 24 hours the app used {formatUsd(app.spentLast24hUsd)} of its {formatUsd(limits.dailyBudgetUsd)} daily share
            {app.spentLast24hUsd >= limits.dailyBudgetUsd ? ', so AI is paused for everyone until older requests are a day old.' : '.'}
          </p>
        )}
      </section>

      <section className="grid gap-2" aria-label="By feature">
        <h3 className="text-sm font-medium">By feature</h3>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="pb-1 text-left font-normal">
                Feature
              </th>
              <th scope="col" className="pb-1 text-right font-normal">
                Today
              </th>
              <th scope="col" className="pb-1 text-right font-normal">
                Month
              </th>
              <th scope="col" className="pb-1 text-right font-normal">
                Cost
              </th>
            </tr>
          </thead>
          <tbody>
            {summary.byFunction.map((usage) => (
              <tr key={usage.name} className={cn('border-t', usage.month === 0 && usage.day === 0 && 'text-muted-foreground')}>
                <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                  {usage.label}
                </th>
                <td className="py-1.5 text-right tabular-nums">{usage.day}</td>
                <td className="py-1.5 pl-2 text-right tabular-nums">{usage.month}</td>
                <td className="py-1.5 pl-2 text-right tabular-nums">{formatUsd(usage.monthUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {view.serverError && (
        <p className="text-xs text-muted-foreground">
          The app's budget isn't available ({view.serverError}), so the default limits are shown.
        </p>
      )}
      {view.aiConfigured === false && (
        <p className="text-xs text-muted-foreground">AI isn't set up on the server yet, so AI features won't work (docs/4-setup-guide.md, step 6).</p>
      )}
    </>
  )
}

function UsageBar({ label, value, max }: { label: string; value: number; max: number }) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value * 100) / 100}
      className="h-2 overflow-hidden rounded-full bg-muted"
    >
      <div
        className={cn('h-full rounded-full', percent >= 100 ? 'bg-destructive' : percent >= 80 ? 'bg-amber-500' : 'bg-primary')}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}
