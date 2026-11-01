import { useState } from 'react'
import { Check, Minus, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { minutesLabel } from '@/features/academics/labels'
import { METRIC_LABEL, METRICS } from '@/features/metrics/metrics'
import { DAY_WINDOWS } from '@/features/planner/planner'
import { cn } from '@/lib/utils'
import { changeProblem, describeChange, editChange, NUMBER_RULES, SHIFT_RULE, type Change, type ChangeContext, type NumberType, type ReviewChange } from './changes'
import { WINDOW_NAME } from './weekStats'

const NUMBER_TEXT: Record<NumberType, (value: number) => string> = {
  set_buffer: (value) => `${value}%`,
  set_review_cap: (value) => `${value} min a day`,
  set_new_cards: (value) => `${value} a day`,
  set_block_length: (value) => `${value} min`,
  set_revision_days: (value) => `${value} days`,
  set_skill_minutes: (value) => `${minutesLabel(value)} a week`,
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

interface ChangeCardProps {
  change: ReviewChange
  ctx: ChangeContext
  busy: boolean
  onApply: (change: Change) => void
  onSkip: () => void
  /** A skipped change can be opened again. */
  onReopen: () => void
}

/** One suggested change: what it does and why, an edit control, and Apply or Skip. */
export function ChangeCard({ change, ctx, busy, onApply, onSkip, onReopen }: ChangeCardProps) {
  const [draft, setDraft] = useState<Change>(change)
  const open = change.status === 'open'
  const shown = open ? draft : change
  const text = describeChange(shown, ctx)
  const problem = open ? changeProblem(draft, ctx) : null

  return (
    <div className={cn('grid gap-2 rounded-lg border p-3 text-sm', !open && 'bg-muted/30')}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{text.title}</p>
        {change.status === 'applied' && <Badge className="shrink-0 bg-mode-life/15 text-mode-life">Applied</Badge>}
        {change.status === 'skipped' && (
          <Badge variant="secondary" className="shrink-0">
            Skipped
          </Badge>
        )}
      </div>
      {text.detail && <p className="text-muted-foreground">{text.detail}</p>}
      {change.reason && <p className="text-xs text-muted-foreground">Why: {change.reason}</p>}
      {open && <ChangeEditor change={draft} ctx={ctx} onChange={setDraft} />}
      {problem && (
        <p role="status" className="text-xs text-destructive">
          {problem}
        </p>
      )}
      {open ? (
        <div className="flex gap-2">
          <Button size="sm" disabled={busy || problem !== null} onClick={() => onApply(draft)}>
            <Check aria-hidden />
            Apply
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onSkip}>
            Skip
          </Button>
        </div>
      ) : (
        change.status === 'skipped' && (
          <Button size="sm" variant="ghost" className="justify-self-start" disabled={busy} onClick={onReopen}>
            Undo skip
          </Button>
        )
      )}
    </div>
  )
}

/** The part of a change the student can edit before applying it: a number, a part of the day or a metric. */
function ChangeEditor({ change, ctx, onChange }: { change: Change; ctx: ChangeContext; onChange: (next: Change) => void }) {
  if ('value' in change) {
    return <Stepper label="Value" value={change.value} rule={NUMBER_RULES[change.type]} text={NUMBER_TEXT[change.type]} onChange={(value) => onChange(editChange(change, { value }))} />
  }
  if (change.type === 'shift_budget') {
    return <Stepper label="Points to move" value={change.points} rule={SHIFT_RULE} text={(value) => `${value}%`} onChange={(value) => onChange(editChange(change, { value }))} />
  }
  if (change.type === 'move_subject_to_window' || change.type === 'set_peak_window') {
    return (
      <Options
        label="Part of the day"
        value={change.window}
        options={DAY_WINDOWS.map((window) => ({ value: window, label: capitalize(WINDOW_NAME[window]) }))}
        onChange={(window) => onChange(editChange(change, { window }))}
      />
    )
  }
  if (change.type === 'challenge_metric') {
    return (
      <Options
        label="Metric"
        value={change.metric}
        options={METRICS.map((metric) => ({ value: metric, label: METRIC_LABEL[metric], disabled: ctx.metrics?.[metric] == null }))}
        onChange={(metric) => onChange(editChange(change, { metric }))}
      />
    )
  }
  return null
}

function Stepper({ label, value, rule, text, onChange }: { label: string; value: number; rule: { min: number; max: number; step: number }; text: (value: number) => string; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <Button variant="outline" size="icon-sm" aria-label="Less" disabled={value <= rule.min} onClick={() => onChange(value - rule.step)}>
        <Minus aria-hidden />
      </Button>
      <span className="min-w-24 text-center tabular-nums">{text(value)}</span>
      <Button variant="outline" size="icon-sm" aria-label="More" disabled={value >= rule.max} onClick={() => onChange(value + rule.step)}>
        <Plus aria-hidden />
      </Button>
    </div>
  )
}

function Options<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (value: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map((option) => (
        <Button key={option.value} size="sm" variant={option.value === value ? 'secondary' : 'outline'} aria-pressed={option.value === value} disabled={option.disabled} onClick={() => onChange(option.value)}>
          {option.label}
        </Button>
      ))}
    </div>
  )
}
