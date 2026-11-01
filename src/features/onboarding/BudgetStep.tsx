import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { STANDARD_BUDGET } from '@/features/planner/planner'
import type { Area, Budget } from '@/features/planner/types'
import { rebalanceBudget } from '@/features/profile/settings'
import { cn } from '@/lib/utils'

const AREAS: { area: Area; label: string; hint: string; color: string }[] = [
  { area: 'academics', label: 'Academics', hint: 'Topics, assignments, revision', color: 'bg-mode-study' },
  { area: 'hustle', label: 'Hustle', hint: 'Freelancing, content, startup', color: 'bg-mode-hustle' },
  { area: 'life', label: 'Life', hint: 'Rest, exercise, friends, chores', color: 'bg-mode-life' },
]

/** Step 4: how your free time is shared. The sliders always add up to 100%. */
export function BudgetStep({ value, onChange }: { value: Budget; onChange: (next: Budget) => void }) {
  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">
        After keeping 12% of your free time as a buffer, the rest is shared like this. From 21 days before an exam it
        switches to 80 / 5 / 15 by itself.
      </p>

      <div className="flex h-3 overflow-hidden rounded-full" aria-hidden>
        {AREAS.map(({ area, color }) => (
          <div key={area} className={cn(color, 'transition-all')} style={{ width: `${value[area]}%` }} />
        ))}
      </div>

      {AREAS.map(({ area, label, hint }) => (
        <div key={area} className="grid gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="font-medium">{label}</p>
              <p className="text-sm text-muted-foreground">{hint}</p>
            </div>
            <span className="text-lg font-semibold tabular-nums">{value[area]}%</span>
          </div>
          <Slider
            aria-label={`${label} share`}
            min={0}
            max={100}
            step={5}
            value={[value[area]]}
            onValueChange={([next]) => {
              if (next !== undefined) onChange(rebalanceBudget(value, area, next))
            }}
          />
        </div>
      ))}

      <Button variant="outline" onClick={() => onChange({ ...STANDARD_BUDGET })}>
        Reset to 55 / 25 / 20
      </Button>
    </div>
  )
}
