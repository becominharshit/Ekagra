import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PEAK_WINDOWS } from '@/features/planner/planner'
import { formatTime } from '@/features/planner/time'
import { CHRONOTYPE_LABEL, MENTOR_TONE_LABEL, type MentorTone } from '@/features/profile/settings'
import type { RhythmDraft } from './onboardingDraft'

const RHYTHMS = (['early', 'neutral', 'night'] as const).map((rhythm) => ({ value: rhythm, label: CHRONOTYPE_LABEL[rhythm] }))

const TONES: { value: MentorTone; label: string; description: string }[] = [
  { value: 'strict', label: MENTOR_TONE_LABEL.strict, description: 'Short, direct reminders. No excuses accepted.' },
  { value: 'balanced', label: MENTOR_TONE_LABEL.balanced, description: 'Clear about what matters, understanding on bad days.' },
  { value: 'friendly', label: MENTOR_TONE_LABEL.friendly, description: 'Encouraging and gentle, celebrates small wins.' },
]

/** Step 3: when you think best, and how your mentor should talk to you. */
export function RhythmStep({ value, onChange }: { value: RhythmDraft; onChange: (next: RhythmDraft) => void }) {
  const tone = TONES.find((option) => option.value === value.mentorTone)

  function chooseRhythm(next: string) {
    const rhythm = RHYTHMS.find((option) => option.value === next)
    if (!rhythm) return
    // A new rhythm also moves the best focus hours to that rhythm's usual window.
    const window = PEAK_WINDOWS[rhythm.value]
    onChange({ ...value, chronotype: rhythm.value, peakStart: formatTime(window.start), peakEnd: formatTime(window.end) })
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <h2 id="rhythm-label" className="font-medium">
          Your rhythm
        </h2>
        <ToggleGroup type="single" variant="outline" aria-labelledby="rhythm-label" value={value.chronotype} onValueChange={chooseRhythm}>
          {RHYTHMS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </section>

      <section className="grid gap-3">
        <h2 className="font-medium">Best focus hours</h2>
        <p className="text-sm text-muted-foreground">The planner puts your hardest topics here.</p>
        <div className="grid grid-cols-2 gap-3">
          <Label className="grid gap-1.5 font-normal">
            <span className="text-sm text-muted-foreground">From</span>
            <Input type="time" value={value.peakStart} onChange={(event) => onChange({ ...value, peakStart: event.target.value })} />
          </Label>
          <Label className="grid gap-1.5 font-normal">
            <span className="text-sm text-muted-foreground">To</span>
            <Input type="time" value={value.peakEnd} onChange={(event) => onChange({ ...value, peakEnd: event.target.value })} />
          </Label>
        </div>
      </section>

      <section className="grid gap-3">
        <h2 id="tone-label" className="font-medium">
          Mentor style
        </h2>
        <ToggleGroup
          type="single"
          variant="outline"
          aria-labelledby="tone-label"
          value={value.mentorTone}
          onValueChange={(next) => {
            const option = TONES.find((candidate) => candidate.value === next)
            if (option) onChange({ ...value, mentorTone: option.value })
          }}
        >
          {TONES.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {tone && <p className="text-sm text-muted-foreground">{tone.description}</p>}
      </section>
    </div>
  )
}
