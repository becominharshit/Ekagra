import { ArrowLeft, LoaderCircle } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ClientsTab } from '@/features/hustle/ClientsTab'
import { EditHustleDialog } from '@/features/hustle/EditHustleDialog'
import { currentPhaseIndex, stepProgress, useHustlePlans, type Hustle, type PhaseWithSteps } from '@/features/hustle/hustles'
import { HustleTasks } from '@/features/hustle/HustleTasks'
import { clientWord, formatMoney, HUSTLE_STATUS_LABEL, targetLabel } from '@/features/hustle/labels'
import { goalProgress, totals, useTransactions } from '@/features/hustle/money'
import { MoneyTab } from '@/features/hustle/MoneyTab'
import { PhaseList, ProgressBar } from '@/features/hustle/PhaseList'
import { PipelineBoard } from '@/features/hustle/PipelineBoard'
import { TEMPLATES, toHustleType } from '@/features/hustle/templates'
import { TimeTab } from '@/features/hustle/TimeTab'

const TABS = ['plan', 'board', 'money', 'time', 'clients'] as const
type Tab = (typeof TABS)[number]

/** One hustle: its goal, its phases with steps, and its pipeline board. */
export function HustleDetailPage() {
  const { hustleId } = useParams()
  const plans = useHustlePlans()
  // The open tab is part of the address, so going back or reloading keeps it.
  const [params, setParams] = useSearchParams()
  const tab: Tab = TABS.find((name) => name === params.get('tab')) ?? 'plan'
  const plan = plans.data?.find((entry) => entry.hustle.id === hustleId)

  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
      <Link to="/hustle">
        <ArrowLeft aria-hidden />
        Hustle
      </Link>
    </Button>
  )
  if (plans.isPending) {
    return (
      <>
        {back}
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Loading…
        </p>
      </>
    )
  }
  if (!plan) {
    return (
      <>
        {back}
        <p role="alert" className="text-sm text-destructive">
          {plans.error?.message ?? 'This hustle was not found. It may have been deleted.'}
        </p>
      </>
    )
  }

  const { hustle, phases } = plan
  return (
    <>
      {back}
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          title={hustle.name}
          subtitle={[TEMPLATES[toHustleType(hustle.type)].label, hustle.status === 'active' ? null : HUSTLE_STATUS_LABEL[hustle.status]].filter(Boolean).join(' · ')}
        />
        <EditHustleDialog hustle={hustle} />
      </div>
      <div className="grid gap-4">
        <GoalCard hustle={hustle} phases={phases} />
        <Tabs value={tab} onValueChange={(value) => setParams({ tab: value }, { replace: true })}>
          <TabsList>
            <TabsTrigger value="plan">Plan</TabsTrigger>
            <TabsTrigger value="board">Board</TabsTrigger>
            <TabsTrigger value="money">Money</TabsTrigger>
            <TabsTrigger value="time">Time</TabsTrigger>
            <TabsTrigger value="clients">{clientWord(hustle.type).many}</TabsTrigger>
          </TabsList>
          <TabsContent value="plan" className="grid gap-3 pt-2">
            <HustleTasks hustle={hustle} />
            <PhaseList phases={phases} />
          </TabsContent>
          <TabsContent value="board" className="pt-2">
            <PipelineBoard hustle={hustle} />
          </TabsContent>
          <TabsContent value="money" className="pt-2">
            <MoneyTab hustle={hustle} />
          </TabsContent>
          <TabsContent value="time" className="pt-2">
            <TimeTab hustle={hustle} />
          </TabsContent>
          <TabsContent value="clients" className="pt-2">
            <ClientsTab hustle={hustle} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}

/** The goal: money earned toward it (net profit) and steps done in the plan. */
function GoalCard({ hustle, phases }: { hustle: Hustle; phases: PhaseWithSteps[] }) {
  const money = useTransactions(hustle.id)
  const progress = stepProgress(phases)
  const index = currentPhaseIndex(phases)
  const target = targetLabel(hustle)
  const net = totals(money.data ?? []).net
  const goal = goalProgress(net, hustle.goal_amount === null ? null : Number(hustle.goal_amount))
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{hustle.goal ?? 'Goal'}</CardTitle>
        <CardDescription>{target ?? (hustle.goal ? 'No money goal' : 'No goal yet: add one with Edit.')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {goal && hustle.goal_amount !== null && (
          <div className="grid gap-1.5">
            <p className="text-sm">
              {formatMoney(net, hustle.currency)} of {formatMoney(Number(hustle.goal_amount), hustle.currency)} earned ({goal.percent}%)
            </p>
            <ProgressBar value={goal.percent} max={100} label={`Money goal: ${goal.percent}%`} />
          </div>
        )}
        <div className="grid gap-1.5">
          <p className="text-sm">
            {progress.done} of {progress.total} steps done{phases.length > 0 && ` · phase ${index + 1} of ${phases.length}`}
          </p>
          <ProgressBar value={progress.done} max={progress.total} label={`${progress.done} of ${progress.total} steps done`} />
        </div>
      </CardContent>
    </Card>
  )
}
