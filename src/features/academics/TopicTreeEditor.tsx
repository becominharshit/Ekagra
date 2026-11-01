import { Plus, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { countLabel, DIFFICULTY_LABEL, minutesLabel } from './labels'
import {
  addTopic,
  addUnit,
  draftSummary,
  removePrerequisite,
  removeTopic,
  removeUnit,
  renameUnit,
  updateTopic,
  type DraftTopic,
  type DraftTree,
} from './topicTree'

/** Check and change a roadmap before saving: units, topics, minutes, difficulty and track. */
export function TopicTreeEditor({ value, onChange }: { value: DraftTree; onChange: (next: DraftTree) => void }) {
  const summary = draftSummary(value)
  const titles = new Map(value.units.flatMap((unit) => unit.topics.map((topic) => [topic.key, topic.title])))

  return (
    <div className="grid gap-5">
      <p className="text-sm text-muted-foreground">
        {countLabel(summary.topics, 'topic')} · {minutesLabel(summary.examMinutes)} on the exam track ·{' '}
        {countLabel(summary.skillTopics, 'skill topic')}
      </p>

      {value.units.map((unit, unitIndex) => (
        <section key={unit.id ?? `unit-${unitIndex}`} className="grid gap-3 rounded-xl border p-3">
          <div className="flex items-center gap-2">
            <Input
              aria-label="Unit name"
              className="font-medium"
              value={unit.title}
              onChange={(event) => onChange(renameUnit(value, unitIndex, event.target.value))}
            />
            <Button variant="ghost" size="icon" aria-label={`Remove ${unit.title || 'this unit'}`} onClick={() => onChange(removeUnit(value, unitIndex))}>
              <Trash2 aria-hidden />
            </Button>
          </div>

          {unit.topics.map((topic) => (
            <TopicRow
              key={topic.key}
              topic={topic}
              prerequisites={topic.prerequisites.map((key) => ({ key, title: titles.get(key) ?? key }))}
              onChange={(patch) => onChange(updateTopic(value, topic.key, patch))}
              onRemove={() => onChange(removeTopic(value, topic.key))}
              onRemovePrerequisite={(key) => onChange(removePrerequisite(value, topic.key, key))}
            />
          ))}

          <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => onChange(addTopic(value, unitIndex))}>
            <Plus aria-hidden />
            Add topic
          </Button>
        </section>
      ))}

      <Button variant="outline" onClick={() => onChange(addUnit(value))}>
        <Plus aria-hidden />
        Add unit
      </Button>
    </div>
  )
}

interface TopicRowProps {
  topic: DraftTopic
  prerequisites: { key: string; title: string }[]
  onChange: (patch: Partial<DraftTopic>) => void
  onRemove: () => void
  onRemovePrerequisite: (key: string) => void
}

function TopicRow({ topic, prerequisites, onChange, onRemove, onRemovePrerequisite }: TopicRowProps) {
  return (
    <div className="grid gap-2 rounded-lg bg-muted/40 p-2.5">
      <div className="flex items-center gap-2">
        <Input aria-label="Topic name" value={topic.title} onChange={(event) => onChange({ title: event.target.value })} />
        <Button variant="ghost" size="icon" aria-label={`Remove ${topic.title || 'this topic'}`} onClick={onRemove}>
          <X aria-hidden />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Input
            type="number"
            inputMode="numeric"
            min={5}
            max={600}
            step={5}
            aria-label={`Minutes for ${topic.title}`}
            className="h-8 w-20"
            value={Number.isFinite(topic.estMinutes) ? topic.estMinutes : ''}
            onChange={(event) => onChange({ estMinutes: event.target.value === '' ? Number.NaN : Number(event.target.value) })}
          />
          min
        </label>
        <Select value={String(topic.difficulty)} onValueChange={(next) => onChange({ difficulty: Number(next) })}>
          <SelectTrigger size="sm" aria-label={`Difficulty of ${topic.title}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5].map((level) => (
              <SelectItem key={level} value={String(level)}>
                {DIFFICULTY_LABEL[level]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={topic.track}
          onValueChange={(next) => onChange(next === 'skill' ? { track: 'skill', examWeight: 0 } : { track: 'exam' })}
        >
          <SelectTrigger size="sm" aria-label={`Track of ${topic.title}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="exam">Exam track</SelectItem>
            <SelectItem value="skill">Skill track</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {prerequisites.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>After:</span>
          {prerequisites.map((prerequisite) => (
            <Badge key={prerequisite.key} variant="secondary" className="gap-1 pr-1">
              {prerequisite.title}
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-foreground/10"
                aria-label={`${topic.title} doesn't need ${prerequisite.title} first`}
                onClick={() => onRemovePrerequisite(prerequisite.key)}
              >
                <X className="size-3" aria-hidden />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
