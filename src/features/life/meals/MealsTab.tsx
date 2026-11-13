import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { MealItem } from '@shared/schemas.ts'
import { format, parseISO } from 'date-fns'
import { Camera, ImagePlus, LoaderCircle, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { WeekBars } from '@/features/metrics/charts'
import { useProfile, useSaveSettings } from '@/features/profile/queries'
import { readSettings } from '@/features/profile/settings'
import { addDays as addLocalDays } from '@/features/planner/time'
import { useNow, useTimezone } from '@/hooks/useNow'
import { formatNumber } from '@/lib/currency'
import { useDataSource } from '@/lib/dataSource'
import { shrinkPhoto } from '@/lib/files'
import { dateKeyInTimezone, zonedLocalToIso } from '@/lib/timezone'
import { useLifeMutation } from '../lifeData'
import {
  caloriesByDay,
  fromItems,
  MEAL_LABEL,
  MEAL_PRESETS,
  MEAL_SLOTS,
  PRESET_GROUPS,
  proteinIdeas,
  slotFor,
  targetsProblem,
  totals,
  type Macros,
  type Meal,
  type MealPreset,
  type MealSlot,
} from './meals'
import { addMeal, deleteMeal, useEstimateMeal, useMeals, type MealEstimate } from './mealsData'

/** The chart shows this many days, today last. */
const DAYS = 7

type MacroField = keyof Macros
type Fields = Record<MacroField, string>

const FIELDS: { field: MacroField; label: string }[] = [
  { field: 'calories', label: 'Calories (kcal)' },
  { field: 'protein_g', label: 'Protein (g)' },
  { field: 'carbs_g', label: 'Carbs (g)' },
  { field: 'fat_g', label: 'Fat (g)' },
]

const CONFIDENCE_LABEL: Record<MealEstimate['confidence'], string> = { low: 'rough guess', medium: 'fairly sure', high: 'quite sure' }

/** The quick-add group that fits each meal comes first. */
const SLOT_GROUP: Record<MealSlot, MealPreset['group']> = { breakfast: 'Breakfast', lunch: 'Meals', snack: 'Snacks and drinks', dinner: 'Meals' }

/** A meal being checked before it's saved: from a photo or typed in, with the estimate if there is one. */
interface Draft {
  source: 'photo' | 'manual'
  estimate: MealEstimate | null
  /** What the student typed; it stays the description. */
  text: string
}

const number = (value: number) => formatNumber(value)
const nowIso = () => new Date().toISOString()
const sourceLabel = (source: string) => (source === 'photo' ? 'from a photo' : source === 'preset' ? 'quick add' : 'typed in')
const toFields = (macros: Macros | null): Fields => ({
  calories: macros ? String(macros.calories) : '',
  protein_g: macros ? String(macros.protein_g) : '',
  carbs_g: macros ? String(macros.carbs_g) : '',
  fat_g: macros ? String(macros.fat_g) : '',
})
const messageOf = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback)

/** Life → Meals: today against the targets, adding a meal (a photo, mess and hostel food, or typed in), today's meals and the last 7 days. */
export function MealsTab() {
  const now = useNow(60_000)
  const timeZone = useTimezone()
  const today = dateKeyInTimezone(now, timeZone)
  const profile = useProfile()
  const meals = useMeals(zonedLocalToIso(addLocalDays(today, 1 - DAYS), 0, timeZone))
  const [slot, setSlot] = useState<MealSlot>(() => slotFor(now))
  const [text, setText] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const add = useLifeMutation(addMeal)
  const remove = useLifeMutation(deleteMeal)

  if (profile.isPending || meals.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading…
      </p>
    )
  }
  if (meals.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {meals.error.message}
      </p>
    )
  }
  const life = readSettings(profile.data?.settings).life
  const all = meals.data ?? []
  const todays = all.filter((meal) => dateKeyInTimezone(meal.eaten_at, timeZone) === today)
  const sum = totals(todays)
  const quickAdd = (preset: MealPreset) =>
    add.mutate(
      { meal: slot, description: preset.name, source: 'preset', eatenAt: nowIso(), calories: preset.calories, protein_g: preset.protein_g, carbs_g: preset.carbs_g, fat_g: preset.fat_g },
      { onSuccess: () => setSaved(`Added ${preset.name} to ${MEAL_LABEL[slot].toLowerCase()}.`) },
    )

  return (
    <div className="grid gap-4">
      <TodayCard sum={sum} calories={life.calories} protein={life.protein} slot={slot} showIdeas={todays.length > 0 && sum.protein_g < life.protein} busy={add.isPending} onAdd={quickAdd} />
      {draft ? (
        <MealEditor
          draft={draft}
          slot={slot}
          onSlot={setSlot}
          onCancel={() => setDraft(null)}
          onSaved={(message) => {
            setDraft(null)
            setText('')
            setSaved(message)
          }}
        />
      ) : (
        <AddMealCard
          slot={slot}
          onSlot={setSlot}
          text={text}
          onText={setText}
          busy={add.isPending}
          onQuickAdd={quickAdd}
          onDraft={(next) => {
            setSaved(null)
            setDraft(next)
          }}
        />
      )}
      {saved && (
        <p role="status" className="text-sm text-muted-foreground">
          {saved}
        </p>
      )}
      {(add.error ?? remove.error) && (
        <p role="alert" className="text-sm text-destructive">
          {(add.error ?? remove.error)?.message}
        </p>
      )}
      <TodayMeals meals={todays} busy={remove.isPending} onDelete={(id) => remove.mutate(id)} />
      <LastDays meals={all} today={today} target={life.calories} />
      <TargetsCard key={`${life.calories}-${life.protein}`} calories={life.calories} protein={life.protein} />
    </div>
  )
}

function SlotPicker({ value, onChange }: { value: MealSlot; onChange: (slot: MealSlot) => void }) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={value}
      onValueChange={(next) => {
        const picked = MEAL_SLOTS.find((slot) => slot === next)
        if (picked) onChange(picked)
      }}
      aria-label="Meal"
    >
      {MEAL_SLOTS.map((slot) => (
        <ToggleGroupItem key={slot} value={slot}>
          {MEAL_LABEL[slot]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

function Meter({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  const over = value - target
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {number(value)} of {number(target)} {unit}
          {over > 0 ? ` (${number(over)} over)` : ''}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-mode-life" style={{ width: `${Math.min(100, Math.round((value / Math.max(1, target)) * 100))}%` }} />
      </div>
    </div>
  )
}

function TodayCard({
  sum,
  calories,
  protein,
  slot,
  showIdeas,
  busy,
  onAdd,
}: {
  sum: Macros
  calories: number
  protein: number
  slot: MealSlot
  showIdeas: boolean
  busy: boolean
  onAdd: (preset: MealPreset) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Today</CardTitle>
        <CardDescription>Calories and protein against your daily targets. All numbers are estimates.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Meter label="Calories" value={sum.calories} target={calories} unit="kcal" />
        <Meter label="Protein" value={sum.protein_g} target={protein} unit="g" />
        <p className="text-xs text-muted-foreground tabular-nums">
          Carbs {number(sum.carbs_g)} g · Fat {number(sum.fat_g)} g
        </p>
        {showIdeas && (
          <div className="grid gap-1.5">
            <p className="text-xs text-muted-foreground">Short on protein? Cheap ideas (one tap adds it to {MEAL_LABEL[slot].toLowerCase()}):</p>
            <div className="flex flex-wrap gap-1.5">
              {proteinIdeas().map((preset) => (
                <Button key={preset.name} size="sm" variant="outline" disabled={busy} onClick={() => onAdd(preset)}>
                  <Plus aria-hidden />
                  {preset.name}
                  <span className="text-muted-foreground tabular-nums">{preset.protein_g} g</span>
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AddMealCard({
  slot,
  onSlot,
  text,
  onText,
  busy,
  onQuickAdd,
  onDraft,
}: {
  slot: MealSlot
  onSlot: (slot: MealSlot) => void
  text: string
  onText: (text: string) => void
  busy: boolean
  onQuickAdd: (preset: MealPreset) => void
  onDraft: (draft: Draft) => void
}) {
  const { source } = useDataSource()
  const estimate = useEstimateMeal()
  const [preparing, setPreparing] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const note = text.trim().slice(0, 300)
  const working = preparing || estimate.isPending
  const groups = [...PRESET_GROUPS].sort((a, b) => Number(b === SLOT_GROUP[slot]) - Number(a === SLOT_GROUP[slot]))

  async function onPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Cleared, so the same photo can be picked again.
    event.target.value = ''
    if (!file) return
    setProblem(null)
    setPreparing(true)
    try {
      // Made smaller on the device and sent with this one request, then dropped: it's never saved.
      const photo = await shrinkPhoto(file)
      const result = await estimate.mutateAsync({ meal: slot, photo, note: note || undefined })
      onDraft({ source: 'photo', estimate: result, text: note })
    } catch (error) {
      setProblem(messageOf(error, "Couldn't estimate that photo. Please try again."))
    } finally {
      setPreparing(false)
    }
  }

  async function estimateText() {
    setProblem(null)
    try {
      onDraft({ source: 'manual', estimate: await estimate.mutateAsync({ meal: slot, note }), text: note })
    } catch (error) {
      setProblem(messageOf(error, "Couldn't estimate that meal. Please try again."))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a meal</CardTitle>
        <CardDescription>Take a photo, tap mess or hostel food, or type it in. You check the numbers before anything is saved.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <SlotPicker value={slot} onChange={onSlot} />
        <Label className="grid gap-1.5 font-normal">
          <span className="text-sm text-muted-foreground">What did you eat? (optional with a photo)</span>
          <Input value={text} maxLength={300} placeholder="e.g. 3 roti, dal, aloo sabzi" onChange={(event) => onText(event.target.value)} />
        </Label>
        <div className="flex flex-wrap gap-2">
          <Button disabled={working} onClick={() => camera.current?.click()}>
            <Camera aria-hidden />
            Take a photo
          </Button>
          <Button variant="outline" disabled={working} onClick={() => gallery.current?.click()}>
            <ImagePlus aria-hidden />
            Choose a photo
          </Button>
          <Button variant="outline" disabled={working || !note} onClick={() => void estimateText()}>
            <Sparkles aria-hidden />
            Estimate from text
          </Button>
          <Button variant="ghost" disabled={working} onClick={() => onDraft({ source: 'manual', estimate: null, text: note })}>
            Enter it myself
          </Button>
        </div>
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(event) => void onPhoto(event)} />
        <input ref={gallery} type="file" accept="image/*" hidden onChange={(event) => void onPhoto(event)} />
        {working && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            {preparing ? 'Looking at your photo…' : 'Estimating…'}
          </p>
        )}
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {source?.kind === 'supabase'
            ? "The photo goes to the AI only for this estimate. It isn't saved anywhere."
            : 'Demo Mode has no AI: the photo stays on this device and you get a sample estimate.'}
        </p>
        <div className="grid gap-3 border-t pt-3">
          <p className="text-sm font-medium">Mess and hostel food (one tap adds it)</p>
          {groups.map((group) => (
            <div key={group} className="grid gap-1.5">
              <p className="text-xs text-muted-foreground">{group}</p>
              <div className="flex flex-wrap gap-1.5">
                {MEAL_PRESETS.filter((preset) => preset.group === group).map((preset) => (
                  <Button key={preset.name} size="sm" variant="outline" disabled={busy || working} onClick={() => onQuickAdd(preset)}>
                    <Plus aria-hidden />
                    {preset.name}
                    <span className="text-muted-foreground tabular-nums">{preset.calories}</span>
                  </Button>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Numbers are kcal for one typical serving.</p>
        </div>
      </CardContent>
    </Card>
  )
}

function MealEditor({ draft, slot, onSlot, onSaved, onCancel }: { draft: Draft; slot: MealSlot; onSlot: (slot: MealSlot) => void; onSaved: (message: string) => void; onCancel: () => void }) {
  const estimate = draft.estimate
  const [items, setItems] = useState<MealItem[]>(estimate?.items ?? [])
  const [description, setDescription] = useState(() => draft.text || fromItems(estimate?.items ?? []).description)
  const [fields, setFields] = useState<Fields>(() => toFields(estimate && estimate.items.length > 0 ? fromItems(estimate.items) : null))
  const save = useLifeMutation(addMeal)

  function removeItem(index: number) {
    const left = items.filter((_, at) => at !== index)
    const summed = fromItems(left)
    // A description made from the foods follows them; the student's own words stay.
    if (description === fromItems(items).description) setDescription(summed.description)
    setItems(left)
    setFields(toFields(left.length > 0 ? summed : null))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const value = (field: MacroField) => (fields[field].trim() === '' ? undefined : Number(fields[field]))
    save.mutate(
      { meal: slot, description, source: draft.source, eatenAt: nowIso(), calories: value('calories'), protein_g: value('protein_g'), carbs_g: value('carbs_g'), fat_g: value('fat_g') },
      { onSuccess: () => onSaved(`Saved to ${MEAL_LABEL[slot].toLowerCase()}.`) },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{estimate ? 'Check the estimate' : 'Type in your meal'}</CardTitle>
        <CardDescription>
          {estimate
            ? "Remove anything that isn't on your plate and fix the numbers if you know better. Nothing is saved until you tap Save."
            : "The numbers are optional: leave them empty if you don't know them."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit}>
          <SlotPicker value={slot} onChange={onSlot} />
          {estimate && (
            <div className="grid gap-2 rounded-lg bg-muted/40 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{estimate.by === 'sample' ? 'Sample (Demo Mode)' : `AI estimate: ${CONFIDENCE_LABEL[estimate.confidence]}`}</Badge>
                {draft.source === 'photo' && <span className="text-xs text-muted-foreground">The photo wasn't saved.</span>}
              </div>
              {estimate.note && <p className="text-muted-foreground">{estimate.note}</p>}
              {items.length === 0 ? (
                <p>No food found. Type what you ate below.</p>
              ) : (
                <ul className="grid gap-1">
                  {items.map((item, index) => (
                    <li key={`${item.name}-${index}`} className="flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="font-medium">{item.name}</span> <span className="text-muted-foreground">· {item.portion}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
                        {item.calories} kcal · {item.protein_g} g protein
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${item.name}`} onClick={() => removeItem(index)}>
                          <X aria-hidden />
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <Label className="grid gap-1.5 font-normal">
            <span className="text-sm text-muted-foreground">What you ate</span>
            <Input value={description} maxLength={300} placeholder="e.g. 3 roti, dal, aloo sabzi" onChange={(event) => setDescription(event.target.value)} />
          </Label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {FIELDS.map(({ field, label }) => (
              <Label key={field} className="grid gap-1.5 font-normal">
                <span className="text-sm text-muted-foreground">{label}</span>
                <Input type="number" inputMode="decimal" min={0} step="any" value={fields[field]} onChange={(event) => setFields({ ...fields, [field]: event.target.value })} />
              </Label>
            ))}
          </div>
          {save.error && (
            <p role="alert" className="text-sm text-destructive">
              {save.error.message}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
              Save
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function TodayMeals({ meals, busy, onDelete }: { meals: Meal[]; busy: boolean; onDelete: (id: string) => void }) {
  if (meals.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Today's meals</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {MEAL_SLOTS.map((slot) => {
          const list = meals.filter((meal) => meal.meal === slot)
          if (list.length === 0) return null
          return (
            <div key={slot} className="grid gap-1.5 text-sm">
              <p className="flex justify-between gap-2 text-xs text-muted-foreground">
                <span>{MEAL_LABEL[slot]}</span>
                <span className="tabular-nums">{number(totals(list).calories)} kcal</span>
              </p>
              <ul className="grid gap-1">
                {list.map((meal) => (
                  <li key={meal.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate">{meal.description}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {format(parseISO(meal.eaten_at), 'HH:mm')} · {meal.calories === null ? 'no numbers' : `${number(Math.round(Number(meal.calories)))} kcal`}
                        {meal.protein_g === null ? '' : ` · ${Math.round(Number(meal.protein_g))} g protein`} · {sourceLabel(meal.source)}
                      </span>
                    </span>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${meal.description}`} disabled={busy} onClick={() => onDelete(meal.id)}>
                      <Trash2 aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function LastDays({ meals, today, target }: { meals: Meal[]; today: string; target: number }) {
  const days = caloriesByDay(meals, today, DAYS)
  const logged = days.filter((day) => day.calories > 0)
  if (logged.length < 2) return null
  const average = Math.round(logged.reduce((sum, day) => sum + day.calories, 0) / logged.length)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Last 7 days</CardTitle>
        <CardDescription>
          About {number(average)} kcal a day on the {logged.length} days you logged meals (your target: {number(target)}).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <WeekBars
          label={`Calories per day over the last 7 days: about ${number(average)} a day`}
          values={days.map((day) => day.calories)}
          format={(value) => number(Math.round(value))}
          liveLast
          firstLabel={format(parseISO(days[0]?.date ?? today), 'EEE d MMM')}
          lastLabel="Today"
        />
      </CardContent>
    </Card>
  )
}

function TargetsCard({ calories, protein }: { calories: number; protein: number }) {
  const [caloriesText, setCaloriesText] = useState(String(calories))
  const [proteinText, setProteinText] = useState(String(protein))
  const save = useSaveSettings()
  const changed = Number(caloriesText) !== calories || Number(proteinText) !== protein
  const problem = changed ? targetsProblem(Number(caloriesText), Number(proteinText)) : null

  function submit(event: FormEvent) {
    event.preventDefault()
    if (problem) return
    save.mutate({ life: { calories: Math.round(Number(caloriesText)), protein: Math.round(Number(proteinText)) } })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Daily targets</CardTitle>
        <CardDescription>Pick numbers that suit you. A doctor or dietitian can tell you what's right for your body.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3">
            <Label className="grid gap-1.5 font-normal">
              <span className="text-sm text-muted-foreground">Calories (kcal)</span>
              <Input type="number" inputMode="numeric" min={800} max={6000} step={50} value={caloriesText} onChange={(event) => setCaloriesText(event.target.value)} />
            </Label>
            <Label className="grid gap-1.5 font-normal">
              <span className="text-sm text-muted-foreground">Protein (g)</span>
              <Input type="number" inputMode="numeric" min={10} max={400} value={proteinText} onChange={(event) => setProteinText(event.target.value)} />
            </Label>
          </div>
          {(problem ?? save.error) && (
            <p role="alert" className="text-sm text-destructive">
              {problem ?? save.error?.message}
            </p>
          )}
          <Button type="submit" variant="outline" className="justify-self-start" disabled={!changed || problem !== null || save.isPending}>
            Save targets
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
