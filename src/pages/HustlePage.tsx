import { useState } from 'react'
import { LoaderCircle, Plus } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { currentPhaseIndex, stepProgress, useHustlePlans, type HustlePlan } from '@/features/hustle/hustles'
import { HUSTLE_STATUS_LABEL, targetLabel } from '@/features/hustle/labels'
import { NewHustleDialog, TemplateTiles } from '@/features/hustle/NewHustleDialog'
import { ProgressBar } from '@/features/hustle/PhaseList'
import { TEMPLATES, toHustleType, type HustleType } from '@/features/hustle/templates'

/** Your hustles, each with its goal and where it stands. */
export function HustlePage() {
  const plans = useHustlePlans()
  // undefined = the dialog is closed, null = open on the list of templates.
  const [start, setStart] = useState<HustleType | null | undefined>(undefined)
  const all = plans.data ?? []
  const shown = all.filter((plan) => plan.hustle.status !== 'archived')
  const archived = all.filter((plan) => plan.hustle.status === 'archived')

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="Hustle" subtitle="Your side hustles, clients and money." />
        {shown.length > 0 && (
          <Button size="sm" onClick={() => setStart(null)}>
            <Plus aria-hidden />
            Start a hustle
          </Button>
        )}
      </div>
      <div className="grid gap-4">
        {plans.isPending && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Loading your hustles…
          </p>
        )}
        {plans.error && (
          <p role="alert" className="text-sm text-destructive">
            {plans.error.message}
          </p>
        )}
        {plans.data && shown.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Start your first hustle</CardTitle>
              <CardDescription>
                Pick a type. You get phases with steps, a pipeline board, and money and time tracking. Your plan already keeps hustle time each day.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TemplateTiles onPick={setStart} />
            </CardContent>
          </Card>
        )}
        {shown.map((plan) => (
          <HustleCard key={plan.hustle.id} plan={plan} />
        ))}
        {archived.length > 0 && (
          <Card size="sm">
            <CardHeader>
              <CardTitle>Archived</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-1 text-sm">
                {archived.map(({ hustle }) => (
                  <li key={hustle.id}>
                    <Link to={`/hustle/${hustle.id}`} className="underline-offset-4 hover:underline">
                      {hustle.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
      <NewHustleDialog start={start} onClose={() => setStart(undefined)} />
    </>
  )
}

function HustleCard({ plan }: { plan: HustlePlan }) {
  const { hustle, phases } = plan
  const progress = stepProgress(phases)
  const index = currentPhaseIndex(phases)
  const phase = phases[index]
  const target = targetLabel(hustle)
  return (
    <Link to={`/hustle/${hustle.id}`} className="block rounded-xl">
      <Card className="transition-colors hover:bg-muted/40">
        <CardHeader>
          <CardTitle>{hustle.name}</CardTitle>
          <CardDescription>{[hustle.goal, target].filter(Boolean).join(' · ') || 'No goal yet'}</CardDescription>
          <CardAction className="flex gap-1">
            <Badge variant="secondary">{TEMPLATES[toHustleType(hustle.type)].label}</Badge>
            {hustle.status === 'paused' && <Badge variant="outline">{HUSTLE_STATUS_LABEL.paused}</Badge>}
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-2">
          <p className="text-sm">{phase ? `Phase ${index + 1} of ${phases.length}: ${phase.title}` : 'No phases yet'}</p>
          <ProgressBar value={progress.done} max={progress.total} label={`${hustle.name}: ${progress.done} of ${progress.total} steps done`} />
        </CardContent>
      </Card>
    </Link>
  )
}
