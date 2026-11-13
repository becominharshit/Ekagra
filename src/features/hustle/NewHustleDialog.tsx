import { useState } from 'react'
import { ArrowLeft, LoaderCircle, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuthStore } from '@/features/auth/authStore'
import { useProfile } from '@/features/profile/queries'
import { defaultCurrencyForLocale } from '@/lib/currency'
import { need, useDataSource } from '@/lib/dataSource'
import { makeCustomPlan, type CustomPlan } from './customPlan'
import { createHustle, useHustleMutation } from './hustles'
import { HUSTLE_TYPES, planFromTemplate, TEMPLATES, type HustleType } from './templates'

/** The 5 templates as tappable tiles. */
export function TemplateTiles({ onPick }: { onPick: (type: HustleType) => void }) {
  return (
    <ul className="grid gap-2">
      {HUSTLE_TYPES.map((type) => (
        <li key={type}>
          <button type="button" onClick={() => onPick(type)} className="grid w-full gap-0.5 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40">
            <span className="font-medium">{TEMPLATES[type].label}</span>
            <span className="text-sm text-muted-foreground">{TEMPLATES[type].description}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

interface NewHustleDialogProps {
  /** undefined = closed, null = open on the list of templates, a type = open on that template. */
  start: HustleType | null | undefined
  onClose: () => void
}

export function NewHustleDialog({ start, onClose }: NewHustleDialogProps) {
  const open = start !== undefined
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        {/* Only exists while open, so it starts fresh every time. */}
        {open && <NewHustleFlow initialType={start} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function NewHustleFlow({ initialType, onClose }: { initialType: HustleType | null; onClose: () => void }) {
  const [type, setType] = useState<HustleType | null>(initialType)
  if (type) return <HustleDetailsForm type={type} onBack={() => setType(null)} onClose={onClose} />
  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Start a hustle</DialogTitle>
        <DialogDescription>Pick what fits. Each one comes with phases, steps and a pipeline board, and you can change them all.</DialogDescription>
      </DialogHeader>
      <TemplateTiles onPick={setType} />
    </div>
  )
}

function HustleDetailsForm({ type, onBack, onClose }: { type: HustleType; onBack: () => void; onClose: () => void }) {
  const template = TEMPLATES[type]
  const isCustom = type === 'custom'
  const navigate = useNavigate()
  const profile = useProfile()
  const { source } = useDataSource()
  const create = useHustleMutation(createHustle)
  const [description, setDescription] = useState('')
  const [name, setName] = useState('')
  const [skill, setSkill] = useState('')
  const [goal, setGoal] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [planning, setPlanning] = useState(false)
  const [plan, setPlan] = useState<CustomPlan | null>(null)

  /** The goal amount, or a problem to show. */
  function readAmount(): { goalAmount: number | null } | null {
    const goalAmount = amount.trim() === '' ? null : Number(amount)
    if (goalAmount !== null && !(goalAmount >= 0 && goalAmount < 10_000_000_000)) {
      setProblem('The goal amount must be a number of 0 or more.')
      return null
    }
    return { goalAmount }
  }

  function start(phases: CustomPlan['phases'], stages: string[], hustleName: string) {
    const checked = readAmount()
    if (!checked) return
    setProblem(null)
    create.mutate(
      {
        type,
        name: hustleName,
        goal: goal.trim() || null,
        goalAmount: checked.goalAmount,
        goalDate: date || null,
        currency: profile.data?.currency ?? defaultCurrencyForLocale(),
        phases,
        stages,
      },
      {
        onSuccess: (id) => {
          onClose()
          void navigate(`/hustle/${id}`)
        },
      },
    )
  }

  async function planIt() {
    if (description.trim().length < 10) {
      setProblem('Describe your idea in a sentence or two.')
      return
    }
    if (!readAmount()) return
    setProblem(null)
    setPlanning(true)
    try {
      setPlan(await makeCustomPlan(need(source), { description, skill, goal }))
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'The plan could not be made. Please try again.')
    } finally {
      setPlanning(false)
    }
  }

  if (plan) {
    return (
      <CustomPlanPreview
        plan={plan}
        initialName={name.trim() || plan.name || skill.trim() || 'My hustle'}
        busy={create.isPending || planning}
        error={problem ?? create.error?.message ?? null}
        onBack={() => setPlan(null)}
        onRetry={() => void planIt()}
        onStart={(hustleName) => start(plan.phases, plan.stages, hustleName)}
      />
    )
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        // No name typed: the skill or the template's name will do (it can be changed later).
        if (isCustom) void planIt()
        else start(planFromTemplate(template, skill), template.stages, name.trim() || skill.trim() || template.label)
      }}
    >
      <DialogHeader>
        <DialogTitle>{template.label}</DialogTitle>
        <DialogDescription>
          {isCustom
            ? 'Describe your idea and the AI plans the phases and steps. You see the plan before anything is saved.'
            : `${template.phases.length} phases: ${template.phases.map((phase) => phase.title).join(' → ')}.`}
        </DialogDescription>
      </DialogHeader>
      {isCustom && (
        <div className="grid gap-1.5">
          <Label htmlFor="hustle-description">Your idea</Label>
          <Textarea
            id="hustle-description"
            rows={3}
            maxLength={2000}
            placeholder="e.g. Sell handmade resin keychains to students at my college and on Instagram"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      )}
      {template.skillQuestion && (
        <div className="grid gap-1.5">
          <Label htmlFor="hustle-skill">{template.skillQuestion}</Label>
          <Input id="hustle-skill" placeholder={`e.g. ${template.skillExample}`} maxLength={80} value={skill} onChange={(event) => setSkill(event.target.value)} />
        </div>
      )}
      {!isCustom && (
        <div className="grid gap-1.5">
          <Label htmlFor="hustle-name">Name</Label>
          <Input id="hustle-name" placeholder={skill.trim() || template.label} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="hustle-goal">Goal (optional)</Label>
        <Input id="hustle-goal" placeholder={template.goalExample} maxLength={160} value={goal} onChange={(event) => setGoal(event.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="hustle-amount">Money goal (optional)</Label>
          <Input id="hustle-amount" type="number" inputMode="numeric" min={0} step={100} placeholder="10000" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="hustle-date">By (optional)</Label>
          <Input id="hustle-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
      </div>
      {(problem ?? create.error) && (
        <p role="alert" className="text-sm text-destructive">
          {problem ?? create.error?.message}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft aria-hidden />
          Other types
        </Button>
        <Button type="submit" disabled={create.isPending || planning}>
          {(create.isPending || planning) && <LoaderCircle className="animate-spin" aria-hidden />}
          {isCustom ? (planning ? 'Planning…' : 'Plan it') : 'Start this hustle'}
        </Button>
      </DialogFooter>
    </form>
  )
}

interface CustomPlanPreviewProps {
  plan: CustomPlan
  initialName: string
  busy: boolean
  error: string | null
  onBack: () => void
  onRetry: () => void
  onStart: (name: string) => void
}

/** The plan for a custom hustle, to check before it is saved. */
function CustomPlanPreview({ plan, initialName, busy, error, onBack, onRetry, onStart }: CustomPlanPreviewProps) {
  const isDemo = useAuthStore((state) => state.status === 'demo')
  const [name, setName] = useState(initialName)
  let note = 'Planned by the AI. You can add and remove steps after starting.'
  if (plan.by === 'template') {
    note = isDemo
      ? 'Demo Mode uses a general plan (the AI plans it when you sign in). You can add and remove steps after starting.'
      : `The AI couldn't plan it (${plan.aiError ?? 'not available'}), so this is a general plan. You can add and remove steps after starting.`
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        onStart(name.trim() || initialName)
      }}
    >
      <DialogHeader>
        <DialogTitle>Your plan</DialogTitle>
        <DialogDescription>{note}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="custom-hustle-name">Name</Label>
        <Input id="custom-hustle-name" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <ol className="grid gap-3">
        {plan.phases.map((phase, index) => (
          <li key={`${index}-${phase.title}`} className="grid gap-1">
            <p className="text-sm font-medium">
              {index + 1}. {phase.title}
            </p>
            <ul className="grid gap-1 pl-4 text-sm text-muted-foreground">
              {phase.steps.map((step, stepIndex) => (
                <li key={`${stepIndex}-${step.title}`} className="list-disc">
                  {step.title}
                  {step.skillName && (
                    <Badge variant="outline" className="ml-2 align-middle">
                      Skill: {step.skillName}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <p className="text-sm">
        <span className="font-medium">Board:</span> {plan.stages.join(' → ')}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter className="sticky bottom-0 bg-popover">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft aria-hidden />
          Change the idea
        </Button>
        {plan.by === 'template' && !isDemo && (
          <Button type="button" variant="outline" disabled={busy} onClick={onRetry}>
            <Sparkles aria-hidden />
            Try the AI again
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {busy && <LoaderCircle className="animate-spin" aria-hidden />}
          Start this hustle
        </Button>
      </DialogFooter>
    </form>
  )
}
