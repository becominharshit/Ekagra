import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Subject } from '@/features/academics/subjects'
import { CARD_WORDS } from '@/features/hustle/labels'
import { TEMPLATES, toHustleType } from '@/features/hustle/templates'
import { cn } from '@/lib/utils'
import type { CaptureField, TaskDraft } from './drafts'
import { AREA_LABEL, PRIORITY_LABEL, toTaskArea, type TaskArea } from './taskRules'

const NO_SUBJECT = 'none'
const NO_HUSTLE = 'none'
const UNSURE = 'ring-2 ring-amber-500/70'
const AREAS: TaskArea[] = ['academics', 'hustle', 'life', 'personal']

interface TaskDraftFieldsProps {
  draft: TaskDraft
  subjects: Pick<Subject, 'id' | 'name' | 'code'>[]
  /** The student's hustles (for hustle tasks). */
  hustles?: { id: string; name: string; type: string }[]
  /** Whether "Save as a card on the board" is offered (in the capture sheet, not when editing a task). */
  canSaveAsCard?: boolean
  onChange: (next: TaskDraft) => void
  onRemove?: () => void
}

/** One task to check: title, due date and time, area, subject or hustle, work time and priority. Guessed fields are highlighted. */
export function TaskDraftFields({ draft, subjects, hustles = [], canSaveAsCard = false, onChange, onRemove }: TaskDraftFieldsProps) {
  const unsure = (field: CaptureField) => draft.unsure.includes(field) && UNSURE
  const chosenHustle = canSaveAsCard && draft.area === 'hustle' ? hustles.find((hustle) => hustle.id === draft.hustleId) : undefined
  // Changing a field means it was checked, so it's no longer highlighted.
  const change = (field: CaptureField | null, patch: Partial<TaskDraft>) =>
    onChange({ ...draft, ...patch, unsure: field ? draft.unsure.filter((other) => other !== field) : draft.unsure })

  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <Input
          aria-label="Task"
          placeholder="What needs doing?"
          maxLength={200}
          className={cn(unsure('title'))}
          value={draft.title}
          onChange={(event) => change('title', { title: event.target.value })}
        />
        {onRemove && (
          <Button variant="ghost" size="icon" aria-label="Remove this task" onClick={onRemove}>
            <X aria-hidden />
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input type="date" aria-label="Due date" className={cn(unsure('dueAt'))} value={draft.dueDate} onChange={(event) => change('dueAt', { dueDate: event.target.value })} />
        <Input type="time" aria-label="Due time (empty = end of the day)" className={cn(unsure('dueAt'))} value={draft.dueTime} onChange={(event) => change('dueAt', { dueTime: event.target.value })} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={draft.area} onValueChange={(value) => change('area', { area: toTaskArea(value) })}>
          <SelectTrigger size="sm" aria-label="Area" className={cn(unsure('area'))}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AREAS.map((area) => (
              <SelectItem key={area} value={area}>
                {AREA_LABEL[area]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {draft.area === 'academics' && subjects.length > 0 && (
          <Select value={draft.subjectId ?? NO_SUBJECT} onValueChange={(value) => change('subject', { subjectId: value === NO_SUBJECT ? null : value })}>
            <SelectTrigger size="sm" aria-label="Subject" className={cn('max-w-48', unsure('subject'))}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SUBJECT}>No subject</SelectItem>
              {subjects.map((subject) => (
                <SelectItem key={subject.id} value={subject.id}>
                  {subject.code ?? subject.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {draft.area === 'hustle' && hustles.length > 0 && (
          <Select value={draft.hustleId ?? NO_HUSTLE} onValueChange={(value) => change('hustle', { hustleId: value === NO_HUSTLE ? null : value, asCard: value === NO_HUSTLE ? false : draft.asCard })}>
            <SelectTrigger size="sm" aria-label="Hustle" className={cn('max-w-48', unsure('hustle'))}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_HUSTLE}>No hustle</SelectItem>
              {hustles.map((hustle) => (
                <SelectItem key={hustle.id} value={hustle.id}>
                  {hustle.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Input
            type="number"
            inputMode="numeric"
            min={5}
            max={1200}
            step={5}
            aria-label="Work time in minutes"
            className={cn('h-8 w-20', unsure('estMinutes'))}
            value={draft.estMinutes ?? ''}
            onChange={(event) => change('estMinutes', { estMinutes: event.target.value === '' ? null : Number(event.target.value) })}
          />
          min of work
        </label>
        <Select value={String(draft.priority)} onValueChange={(value) => change(null, { priority: Number(value) })}>
          <SelectTrigger size="sm" aria-label="Priority">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4].map((level) => (
              <SelectItem key={level} value={String(level)}>
                {PRIORITY_LABEL[level]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {chosenHustle && (
        <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Save as">
          <span className="text-muted-foreground">Save as</span>
          <Button type="button" size="xs" variant={draft.asCard ? 'outline' : 'default'} aria-pressed={!draft.asCard} onClick={() => change(null, { asCard: false })}>
            A to-do
          </Button>
          <Button type="button" size="xs" variant={draft.asCard ? 'default' : 'outline'} aria-pressed={draft.asCard} onClick={() => change(null, { asCard: true })}>
            {cardWord(chosenHustle.type)} on the board
          </Button>
        </div>
      )}
      {draft.unsure.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">Check the highlighted fields: they were guessed.</p>}
    </div>
  )
}

/** "Order", "Post", "Session"…: what a card on that hustle's board is. */
function cardWord(type: string): string {
  const word = CARD_WORDS[TEMPLATES[toHustleType(type)].itemKind].card
  return word.charAt(0).toUpperCase() + word.slice(1)
}
