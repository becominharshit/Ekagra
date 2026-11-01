import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { MEALS, newBlockId, WEEKDAYS, type MealName, type RoutineDraft, type TimeBlockDraft } from './routineDraft'

// Monday first, the way most college timetables are written.
const DAYS = [
  { value: 1, short: 'M', name: 'Monday' },
  { value: 2, short: 'T', name: 'Tuesday' },
  { value: 3, short: 'W', name: 'Wednesday' },
  { value: 4, short: 'T', name: 'Thursday' },
  { value: 5, short: 'F', name: 'Friday' },
  { value: 6, short: 'S', name: 'Saturday' },
  { value: 0, short: 'S', name: 'Sunday' },
]

/** Step 2: the fixed parts of your week. The planner only plans around these. */
export function RoutineStep({ value, onChange }: { value: RoutineDraft; onChange: (next: RoutineDraft) => void }) {
  const updateList = (key: 'classes' | 'other', id: string, next: TimeBlockDraft) =>
    onChange({ ...value, [key]: value[key].map((block) => (block.id === id ? next : block)) })
  const removeFromList = (key: 'classes' | 'other', id: string) =>
    onChange({ ...value, [key]: value[key].filter((block) => block.id !== id) })

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <h2 className="font-medium">Sleep</h2>
        <div className="grid grid-cols-2 gap-3">
          <TimeField label="Wake up" value={value.wake} onChange={(wake) => onChange({ ...value, wake })} />
          <TimeField label="Bedtime" value={value.bed} onChange={(bed) => onChange({ ...value, bed })} />
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="font-medium">Classes</h2>
        {value.classes.map((block) => (
          <TimeBlockEditor
            key={block.id}
            block={block}
            onChange={(next) => updateList('classes', block.id, next)}
            onRemove={() => removeFromList('classes', block.id)}
          />
        ))}
        <Button
          variant="outline"
          onClick={() =>
            onChange({
              ...value,
              classes: [...value.classes, { id: newBlockId(), title: 'Classes', days: [...WEEKDAYS], start: '09:00', end: '13:00' }],
            })
          }
        >
          <Plus aria-hidden />
          Add class times
        </Button>
      </section>

      <section className="grid gap-3">
        <h2 className="font-medium">Gym</h2>
        {value.gym ? (
          <TimeBlockEditor
            block={value.gym}
            onChange={(gym) => onChange({ ...value, gym })}
            onRemove={() => onChange({ ...value, gym: null })}
          />
        ) : (
          <Button
            variant="outline"
            onClick={() =>
              onChange({ ...value, gym: { id: newBlockId(), title: 'Gym', days: [1, 3, 5], start: '18:00', end: '19:00' } })
            }
          >
            <Plus aria-hidden />
            Add gym time
          </Button>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="font-medium">Meals (every day)</h2>
        {MEALS.map((meal) => (
          <MealRow key={meal} meal={meal} value={value} onChange={onChange} />
        ))}
      </section>

      <section className="grid gap-3">
        <h2 className="font-medium">Other fixed times</h2>
        <p className="text-sm text-muted-foreground">Commute, tuition, part-time work: anything the planner should leave free.</p>
        {value.other.map((block) => (
          <TimeBlockEditor
            key={block.id}
            block={block}
            onChange={(next) => updateList('other', block.id, next)}
            onRemove={() => removeFromList('other', block.id)}
          />
        ))}
        <Button
          variant="outline"
          onClick={() =>
            onChange({
              ...value,
              other: [...value.other, { id: newBlockId(), title: 'Commute', days: [...WEEKDAYS], start: '08:15', end: '08:45' }],
            })
          }
        >
          <Plus aria-hidden />
          Add a fixed time
        </Button>
      </section>
    </div>
  )
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Label className="grid gap-1.5 font-normal">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Input type="time" value={value} onChange={(event) => onChange(event.target.value)} />
    </Label>
  )
}

function TimeBlockEditor({
  block,
  onChange,
  onRemove,
}: {
  block: TimeBlockDraft
  onChange: (next: TimeBlockDraft) => void
  onRemove: () => void
}) {
  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <Input aria-label="Name" value={block.title} onChange={(event) => onChange({ ...block, title: event.target.value })} />
        <Button variant="ghost" size="icon" aria-label={`Remove ${block.title || 'this block'}`} onClick={onRemove}>
          <X aria-hidden />
        </Button>
      </div>
      <ToggleGroup
        type="multiple"
        variant="outline"
        size="sm"
        spacing={1}
        aria-label={`Days for ${block.title || 'this block'}`}
        value={block.days.map(String)}
        onValueChange={(days) => onChange({ ...block, days: days.map(Number) })}
      >
        {DAYS.map((day) => (
          <ToggleGroupItem key={day.value} value={String(day.value)} aria-label={day.name} className="w-8">
            {day.short}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="grid grid-cols-2 gap-3">
        <TimeField label="From" value={block.start} onChange={(start) => onChange({ ...block, start })} />
        <TimeField label="To" value={block.end} onChange={(end) => onChange({ ...block, end })} />
      </div>
    </div>
  )
}

function MealRow({ meal, value, onChange }: { meal: MealName; value: RoutineDraft; onChange: (next: RoutineDraft) => void }) {
  const current = value.meals[meal]
  const update = (patch: Partial<typeof current>) =>
    onChange({ ...value, meals: { ...value.meals, [meal]: { ...current, ...patch } } })

  return (
    <div className="grid grid-cols-[6.5rem_1fr_1fr] items-end gap-2">
      <Button
        variant={current.on ? 'default' : 'outline'}
        aria-pressed={current.on}
        aria-label={`${meal}: ${current.on ? 'on' : 'off'}`}
        onClick={() => update({ on: !current.on })}
      >
        {meal}
      </Button>
      <Input type="time" aria-label={`${meal} from`} disabled={!current.on} value={current.start} onChange={(event) => update({ start: event.target.value })} />
      <Input type="time" aria-label={`${meal} to`} disabled={!current.on} value={current.end} onChange={(event) => update({ end: event.target.value })} />
    </div>
  )
}
