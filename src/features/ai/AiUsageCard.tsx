import { format } from 'date-fns'
import { Link } from 'react-router'
import { DEFAULT_ENTITLEMENTS } from '@shared/billing.ts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PLAN_CATALOG } from '@/features/billing/billing'
import { cn } from '@/lib/utils'
import { formatUsd, useAiUsage, type AiUsageView } from './usage'

/** Me → AI usage: today's requests and monthly token allowance against the student's active plan tier. */
export function AiUsageCard() {
  const usage = useAiUsage()

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>AI usage</CardTitle>
          {usage.data?.kind === 'signed_in' && (
            <Badge variant={usage.data.tier === 'free' ? 'secondary' : 'default'}>
              {PLAN_CATALOG[usage.data.tier].name}
            </Badge>
          )}
        </div>
        <CardDescription>Your daily AI requests, monthly token allowance, and cost by feature.</CardDescription>
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
            Demo Mode runs sample AI responses locally on your device. Signed-in Starter accounts include{' '}
            {DEFAULT_ENTITLEMENTS.free.dailyAiRequests} AI requests/day and{' '}
            {DEFAULT_ENTITLEMENTS.free.monthlyAiTokens.toLocaleString()} monthly tokens, with Pro upgrading to{' '}
            {DEFAULT_ENTITLEMENTS.pro.dailyAiRequests} priority requests/day.
          </p>
        ) : (
          <SignedInUsage view={usage.data} />
        )}
      </CardContent>
    </Card>
  )
}

function SignedInUsage({ view }: { view: Extract<AiUsageView, { kind: 'signed_in' }> }) {
  const { summary, limits, tier, tokensThisMonth } = view

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
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>Daily cap reached; resets from {format(summary.nextFreeAt, 'h:mm a')}.</span>
            {tier === 'free' && (
              <Button asChild size="sm" variant="link" className="h-auto p-0">
                <Link to="/pricing">Upgrade to Pro</Link>
              </Button>
            )}
          </div>
        )}
      </section>

      <section className="grid gap-2" aria-label="This month">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-medium">Monthly tokens (since {format(view.monthStart, 'd MMM')})</h3>
          <span className="text-sm tabular-nums">
            {tokensThisMonth.toLocaleString()} of {limits.monthlyAiTokens.toLocaleString()}
          </span>
        </div>
        <UsageBar label="Monthly AI tokens used" value={tokensThisMonth} max={limits.monthlyAiTokens} />
        <p className="text-xs text-muted-foreground">
          {summary.month} {summary.month === 1 ? 'request' : 'requests'} this month · estimated API cost {formatUsd(summary.monthUsd)}
        </p>
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
          Server plan details aren't available ({view.serverError}), so Starter limits are shown.
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
