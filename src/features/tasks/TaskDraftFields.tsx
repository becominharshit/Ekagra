import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Subject } from '@/features/academics/subjects'
import { cn } from '@/lib/utils'
import type { CaptureField, TaskDraft } from './drafts'
import { AREA_LABEL, PRIORITY_LABEL, toTaskArea, type TaskArea } from './taskRules'

const NO_SUBJECT = 'none'
const UNSURE = 'ring-2 ring-amber-500/70'
const AREAS: TaskArea[] = ['academics', 'hustle', 'life', 'personal']

interface TaskDraftFieldsProps {
  draft: TaskDraft
  subjects: Pick<Subject, 'id' | 'name' | 'code'>[]
  onChange: (next: TaskDraft) => void
  onRemove?: () => void
}

/** One task to check: title, due date and time, area, subject, work time and priority. Guessed fields are highlighted. */
export function TaskDraftFields({ draft, subjects, onChange, onRemove }: TaskDraftFieldsProps) {
  const unsure = (field: CaptureField) => draft.unsure.includes(field) && UNSURE
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
      {draft.unsure.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">Check the highlighted fields: they were guessed.</p>}
    </div>
  )
}
