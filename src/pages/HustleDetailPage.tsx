import { ArrowLeft, LoaderCircle } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EditHustleDialog } from '@/features/hustle/EditHustleDialog'
import { currentPhaseIndex, stepProgress, useHustlePlans } from '@/features/hustle/hustles'
import { HUSTLE_STATUS_LABEL, targetLabel } from '@/features/hustle/labels'
import { PhaseList, ProgressBar } from '@/features/hustle/PhaseList'
import { PipelineBoard } from '@/features/hustle/PipelineBoard'
import { TEMPLATES, toHustleType } from '@/features/hustle/templates'

const TABS = ['plan', 'board'] as const
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
  const progress = stepProgress(phases)
  const index = currentPhaseIndex(phases)
  const target = targetLabel(hustle)
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
        <Card size="sm">
          <CardHeader>
            <CardTitle>{hustle.goal ?? 'Goal'}</CardTitle>
            <CardDescription>{target ?? (hustle.goal ? 'No money goal' : 'No goal yet: add one with Edit.')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <p className="text-sm">
              {progress.done} of {progress.total} steps done{phases.length > 0 && ` · phase ${index + 1} of ${phases.length}`}
            </p>
            <ProgressBar value={progress.done} max={progress.total} label={`${progress.done} of ${progress.total} steps done`} />
          </CardContent>
        </Card>
        <Tabs value={tab} onValueChange={(value) => setParams({ tab: value }, { replace: true })}>
          <TabsList>
            <TabsTrigger value="plan">Plan</TabsTrigger>
            <TabsTrigger value="board">Board</TabsTrigger>
          </TabsList>
          <TabsContent value="plan" className="pt-2">
            <PhaseList phases={phases} />
          </TabsContent>
          <TabsContent value="board" className="pt-2">
            <PipelineBoard hustle={hustle} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
