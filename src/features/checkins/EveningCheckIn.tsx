import { useState } from 'react'
import { format } from 'date-fns'
import { LoaderCircle, Moon, Pencil, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { minutesLabel } from '@/features/academics/labels'
import { useBlocks } from '@/features/planner/planBlocks'
import { usePlanner } from '@/features/planner/replan'
import { localDateOf, minuteOf, type PlanBlock } from '@/features/planner/schedule'
import { addDays } from '@/features/planner/time'
import type { LocalDate } from '@/features/planner/types'
import { useActiveFocus, type BlockOutcome } from '@/features/today/focus'
import { useTodayMutation } from '@/features/today/todayMutation'
import { useNow } from '@/hooks/useNow'
import { guardOn, saveEveningCheckIn, useCheckIns, type CheckIn } from './checkins'

/** Checking in ends the day, so the card shows from 8 PM, or earlier once the day's last block has started. */
const EVENING = 20 * 60
const DISTRACTIONS = ['Phone or social media', 'YouTube or videos', 'Games', 'Friends or chats', 'Too tired', 'Noise or people', 'Nothing really']
const OTHER = 'Something else'
const OUTCOMES: { value: BlockOutcome; label: string }[] = [
  { value: 'done', label: 'Done' },
  { value: 'partial', label: 'Partly' },
  { value: 'missed', label: 'Missed' },
]

const time = (iso: string) => format(new Date(iso), 'HH:mm')
const isOpen = (block: PlanBlock) => block.status === 'planned' || block.status === 'in_progress'

function summary(row: CheckIn): string {
  return [`Energy ${row.energy}/5`, `mood ${row.mood}/5`, row.top_distraction && `biggest distraction: ${row.top_distraction}`].filter(Boolean).join(' · ')
}

/** The 1-minute evening check-in: mark today's blocks, rate energy and mood, name the biggest distraction. */
export function EveningCheckIn() {
  const now = useNow(60_000)
  const today = localDateOf(now)
  const blocks = useBlocks(today, today)
  const checkIns = useCheckIns(today)
  const [open, setOpen] = useState(false)
  if (!blocks.data || !checkIns.data) return null

  const row = checkIns.data.find((checkIn) => checkIn.date === today) ?? null
  const checkedIn = row?.checked_in_at != null
  const lastBlockStarted = blocks.data.length > 0 && !blocks.data.some((block) => isOpen(block) && Date.parse(block.start_at) > now.getTime())
  if (!checkedIn && minuteOf(now) < EVENING && !lastBlockStarted) return null

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Moon className="size-4" aria-hidden />
          Evening check-in
        </CardTitle>
        <CardDescription>
          {checkedIn && row
            ? summary(row)
            : "Done for the day? Mark your blocks and rate your energy and mood. It takes a minute, then tomorrow is planned."}
        </CardDescription>
        {checkedIn && (
          <CardAction>
            <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
              <Pencil aria-hidden />
              Edit
            </Button>
          </CardAction>
        )}
      </CardHeader>
      {!checkedIn && (
        <CardContent>
          <Button onClick={() => setOpen(true)}>Check in</Button>
        </CardContent>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          {/* Only exists while open, so it starts from the saved values every time. */}
          {open && <CheckInFlow today={today} blocks={blocks.data} row={row} onClose={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function outcomeOf(block: PlanBlock): BlockOutcome | undefined {
  return block.status === 'done' || block.status === 'partial' || block.status === 'missed' ? block.status : undefined
}

interface CheckInFlowProps {
  today: LocalDate
  /** All of today's blocks: checking in ends the day. */
  blocks: PlanBlock[]
  row: CheckIn | null
  onClose: () => void
}

function CheckInFlow({ today, blocks, row, onClose }: CheckInFlowProps) {
  const focus = useActiveFocus()
  const save = useTodayMutation(saveEveningCheckIn)
  const planner = usePlanner()
  const [outcomes, setOutcomes] = useState<Record<string, BlockOutcome | undefined>>(() =>
    Object.fromEntries(blocks.map((block) => [block.id, outcomeOf(block)])),
  )
  const [energy, setEnergy] = useState<number | null>(row?.energy ?? null)
  const [mood, setMood] = useState<number | null>(row?.mood ?? null)
  const savedOther = row?.top_distraction && !DISTRACTIONS.includes(row.top_distraction) ? row.top_distraction : ''
  const [distraction, setDistraction] = useState<string | null>(savedOther ? OTHER : (row?.top_distraction ?? null))
  const [otherText, setOtherText] = useState(savedOther)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)

  if (finished) return <CheckInDone today={today} onClose={onClose} />

  async function submit() {
    if (energy === null || mood === null) return
    setBusy(true)
    setError(null)
    try {
      await save.mutateAsync({
        date: today,
        energy,
        mood,
        topDistraction: distraction === OTHER ? otherText.trim() || null : distraction,
        // Blocks that aren't marked count as missed.
        outcomes: blocks.map((block) => ({ block, outcome: outcomes[block.id] ?? 'missed' })),
        session: focus.data ?? null,
      })
      await planner.replanAsync('tomorrow')
      setFinished(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your check-in could not be saved. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // grid-cols-1 and min-w-0 let the rows be narrower than their content, so long titles are cut with "…".
  return (
    <div className="grid min-w-0 grid-cols-1 gap-5">
      <DialogHeader>
        <DialogTitle>Evening check-in</DialogTitle>
        <DialogDescription>One minute, then tomorrow is planned around how you feel.</DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-2">
        <p className="text-sm font-medium">Today's blocks</p>
        {blocks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing was planned for today.</p>
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-2">
              {blocks.map((block) => (
                <li key={block.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className="tabular-nums text-muted-foreground">{time(block.start_at)}</span> {block.title}
                  </span>
                  <div className="flex shrink-0 gap-1" role="group" aria-label={`How did "${block.title}" go?`}>
                    {OUTCOMES.map((option) => (
                      <Button
                        key={option.value}
                        type="button"
                        size="sm"
                        variant={outcomes[block.id] === option.value ? 'default' : 'outline'}
                        aria-pressed={outcomes[block.id] === option.value}
                        onClick={() => setOutcomes({ ...outcomes, [block.id]: option.value })}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Blocks you don't mark count as missed; their work moves to the next days.</p>
          </>
        )}
      </div>

      <Scale label="Energy" low="Drained" high="Full of energy" value={energy} onChange={setEnergy} />
      <Scale label="Mood" low="Low" high="Great" value={mood} onChange={setMood} />

      <div className="grid gap-2">
        <p className="text-sm font-medium">Biggest distraction today</p>
        <div className="flex flex-wrap gap-1.5">
          {[...DISTRACTIONS, OTHER].map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={distraction === option ? 'default' : 'outline'}
              aria-pressed={distraction === option}
              onClick={() => setDistraction(distraction === option ? null : option)}
            >
              {option}
            </Button>
          ))}
        </div>
        {distraction === OTHER && (
          <Input aria-label="What distracted you?" placeholder="What distracted you?" maxLength={80} value={otherText} onChange={(event) => setOtherText(event.target.value)} />
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter className="sticky bottom-0 bg-popover">
        <Button disabled={busy || energy === null || mood === null} onClick={() => void submit()}>
          {busy && <LoaderCircle className="animate-spin" aria-hidden />}
          {busy ? 'Planning tomorrow…' : 'Save and plan tomorrow'}
        </Button>
      </DialogFooter>
    </div>
  )
}

/** 1–5 buttons, e.g. for energy. */
function Scale({ label, low, high, value, onChange }: { label: string; low: string; high: string; value: number | null; onChange: (value: number) => void }) {
  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div className="grid grid-cols-5 gap-2" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5].map((level) => (
          <Button
            key={level}
            type="button"
            variant={value === level ? 'default' : 'outline'}
            aria-pressed={value === level}
            aria-label={`${label} ${level} of 5`}
            onClick={() => onChange(level)}
          >
            {level}
          </Button>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  )
}

/** After saving: how much is planned for tomorrow, and whether the Burnout Guard is on. */
function CheckInDone({ today, onClose }: { today: LocalDate; onClose: () => void }) {
  const tomorrow = addDays(today, 1)
  const blocks = useBlocks(tomorrow, tomorrow)
  const checkIns = useCheckIns(today)
  const minutes = (blocks.data ?? []).filter((block) => block.status === 'planned').reduce((total, block) => total + block.planned_minutes, 0)
  const guard = checkIns.data ? guardOn(tomorrow, checkIns.data) : false

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Saved. Rest well!</DialogTitle>
        <DialogDescription>
          {blocks.isPending ? 'Planning tomorrow…' : `Tomorrow is planned: ${minutesLabel(minutes)} of blocks. See it under Your plan → Tomorrow.`}
        </DialogDescription>
      </DialogHeader>
      {guard && (
        <p className="flex gap-2 rounded-lg bg-sky-500/10 p-3 text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          Burnout Guard is on: your last 3 check-ins had low energy, so tomorrow is 30% lighter.
        </p>
      )}
      <DialogFooter>
        <Button onClick={onClose}>Close</Button>
      </DialogFooter>
    </div>
  )
}
