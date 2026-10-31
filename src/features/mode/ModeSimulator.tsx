import { addMinutes, format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useNow } from '@/hooks/useNow'
import { activeBlock, MODE_LABEL, SWITCH_REASONS, type ScheduledBlock } from './modes'
import { useModeStore } from './modeStore'

const BLOCK_MINUTES = 60
const SIMULATED_MODES: ScheduledBlock['mode'][] = ['study', 'hustle', 'life']

/** A pretend plan block that starts at `start` and lasts BLOCK_MINUTES. */
function practiceBlock(mode: ScheduledBlock['mode'], start: Date): ScheduledBlock {
  return {
    id: `sim-${start.getTime()}`,
    mode,
    title: `Practice ${MODE_LABEL[mode]} block`,
    startsAt: start.toISOString(),
    endsAt: addMinutes(start, BLOCK_MINUTES).toISOString(),
  }
}

/**
 * TEMPORARY (removed in Milestone 4, when the real planner exists):
 * pretends your plan has a block running right now, so you can try the
 * Mode Chip and the mode-switch warning.
 */
export function ModeSimulator() {
  const now = useNow()
  const block = useModeStore((state) => state.block)
  const setBlock = useModeStore((state) => state.setBlock)
  const switchLog = useModeStore((state) => state.switchLog)
  const active = activeBlock(block, now)

  function reasonLabel(value: string) {
    return SWITCH_REASONS.find((option) => option.value === value)?.label ?? value
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mode simulator (temporary)</CardTitle>
        <CardDescription>
          Starts a pretend {BLOCK_MINUTES}-minute block so you can test the Mode Chip and the switch warning. The
          real planner replaces this in Milestone 4.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-2 gap-2">
          {SIMULATED_MODES.map((mode) => (
            <Button
              key={mode}
              variant={active?.mode === mode ? 'default' : 'outline'}
              aria-pressed={active?.mode === mode}
              onClick={() => setBlock(practiceBlock(mode, new Date()))}
            >
              {MODE_LABEL[mode]} block
            </Button>
          ))}
          <Button variant="outline" disabled={!active} onClick={() => setBlock(null)}>
            End block (Free)
          </Button>
        </div>

        <div className="grid gap-2">
          <h3 className="text-sm font-medium">Switch log</h3>
          {switchLog.length === 0 ? (
            <p className="text-sm text-muted-foreground">No switches yet.</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {switchLog.slice(0, 5).map((event) => (
                <li key={event.at} className="text-muted-foreground">
                  {format(new Date(event.at), 'h:mm a')} · {MODE_LABEL[event.fromMode]} → {MODE_LABEL[event.toMode]} ·{' '}
                  {reasonLabel(event.reason)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
