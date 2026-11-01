import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { addStep, currentPhaseIndex, deleteStep, phaseStatus, setStepDone, useHustleMutation, type HustleStep, type PhaseWithSteps } from './hustles'
import { PHASE_STATUS_LABEL } from './labels'

/** A thin bar showing how much is done. */
export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
    </div>
  )
}

/** A hustle's phases in order, each with its checkable steps. The phase to work on now stands out. */
export function PhaseList({ phases }: { phases: PhaseWithSteps[] }) {
  const current = currentPhaseIndex(phases)
  return (
    <ol className="grid gap-3">
      {phases.map((phase, index) => (
        <PhaseCard key={phase.id} phase={phase} number={index + 1} isCurrent={index === current && phase.status !== 'done'} />
      ))}
    </ol>
  )
}

function PhaseCard({ phase, number, isCurrent }: { phase: PhaseWithSteps; number: number; isCurrent: boolean }) {
  // Finished phases start folded up; the others start open.
  const [open, setOpen] = useState(phase.status !== 'done')
  const [newStep, setNewStep] = useState('')
  const toggle = useHustleMutation(setStepDone)
  const add = useHustleMutation(addStep)
  const remove = useHustleMutation(deleteStep)
  const error = toggle.error ?? add.error ?? remove.error

  // Show a tap right away, before the save has finished.
  const isDone = (step: HustleStep) => (toggle.isPending && toggle.variables.step.id === step.id ? toggle.variables.done : step.done)
  const steps = phase.steps.map((step) => ({ ...step, done: isDone(step) }))
  const doneCount = steps.filter((step) => step.done).length

  return (
    <li>
      <Card size="sm" className={cn(isCurrent && 'ring-2 ring-primary/30')}>
        <CardHeader>
          <CardTitle>
            {number}. {phase.title}
          </CardTitle>
          <CardDescription>
            {PHASE_STATUS_LABEL[phaseStatus(steps)]} · {doneCount} of {steps.length} steps
          </CardDescription>
          <CardAction>
            <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? 'Hide' : 'Show'}
            </Button>
          </CardAction>
        </CardHeader>
        {open && (
          <CardContent className="grid gap-3">
            <ul className="grid gap-2.5">
              {steps.map((step) => (
                <li key={step.id} className="flex items-start gap-2.5">
                  <Checkbox
                    id={`step-${step.id}`}
                    className="mt-0.5"
                    checked={step.done}
                    onCheckedChange={(value) => toggle.mutate({ step, done: value === true, phase })}
                  />
                  <label htmlFor={`step-${step.id}`} className={cn('min-w-0 flex-1 text-sm', step.done && 'text-muted-foreground line-through')}>
                    {step.title}
                    {step.skill_name && (
                      <Badge variant="outline" className="ml-2 align-middle">
                        Skill: {step.skill_name}
                      </Badge>
                    )}
                  </label>
                  <Button variant="ghost" size="icon-xs" aria-label={`Remove the step "${step.title}"`} disabled={remove.isPending} onClick={() => remove.mutate({ step, phase })}>
                    <X aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                if (newStep.trim()) add.mutate({ phase, title: newStep }, { onSuccess: () => setNewStep('') })
              }}
            >
              <Input aria-label={`New step in "${phase.title}"`} placeholder="Add a step" maxLength={200} value={newStep} onChange={(event) => setNewStep(event.target.value)} />
              <Button type="submit" variant="outline" disabled={!newStep.trim() || add.isPending}>
                <Plus aria-hidden />
                Add
              </Button>
            </form>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error.message}
              </p>
            )}
          </CardContent>
        )}
      </Card>
    </li>
  )
}
