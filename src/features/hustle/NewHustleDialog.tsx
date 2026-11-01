import { useState } from 'react'
import { ArrowLeft, LoaderCircle } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useProfile } from '@/features/profile/queries'
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
  const navigate = useNavigate()
  const profile = useProfile()
  const create = useHustleMutation(createHustle)
  const [name, setName] = useState('')
  const [skill, setSkill] = useState('')
  const [goal, setGoal] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  function submit() {
    const goalAmount = amount.trim() === '' ? null : Number(amount)
    if (goalAmount !== null && !(goalAmount >= 0 && goalAmount < 10_000_000_000)) {
      setProblem('The goal amount must be a number of 0 or more.')
      return
    }
    setProblem(null)
    create.mutate(
      {
        type,
        // No name typed: the skill or the template's name will do (it can be changed later).
        name: name.trim() || skill.trim() || template.label,
        goal: goal.trim() || null,
        goalAmount,
        goalDate: date || null,
        currency: profile.data?.currency ?? 'INR',
        phases: planFromTemplate(template, skill),
        stages: template.stages,
      },
      {
        onSuccess: (id) => {
          onClose()
          void navigate(`/hustle/${id}`)
        },
      },
    )
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <DialogHeader>
        <DialogTitle>{template.label}</DialogTitle>
        <DialogDescription>
          {template.phases.length} phases: {template.phases.map((phase) => phase.title).join(' → ')}.
        </DialogDescription>
      </DialogHeader>
      {template.skillQuestion && (
        <div className="grid gap-1.5">
          <Label htmlFor="hustle-skill">{template.skillQuestion}</Label>
          <Input id="hustle-skill" placeholder={`e.g. ${template.skillExample}`} maxLength={80} value={skill} onChange={(event) => setSkill(event.target.value)} />
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="hustle-name">Name</Label>
        <Input id="hustle-name" placeholder={skill.trim() || template.label} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
      </div>
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
        <Button type="submit" disabled={create.isPending}>
          {create.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
          Start this hustle
        </Button>
      </DialogFooter>
    </form>
  )
}
