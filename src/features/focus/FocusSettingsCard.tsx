import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useProfile, useSaveSettings } from '@/features/profile/queries'
import { readSettings } from '@/features/profile/settings'
import { TIMER_LABEL, type FocusMode } from './timer'

const MODES: FocusMode[] = ['pomodoro', 'deep', 'custom']
const BLOCK_DURING = [
  { value: 'focus_sessions', label: 'Focus sessions' },
  { value: 'study_blocks', label: 'Every Study block' },
] as const

/** Buttons where one is chosen. */
function Choices<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {options.map((option) => (
          <Button key={option.value} size="sm" variant={value === option.value ? 'default' : 'outline'} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

/** Focus and Tollbooth settings: saved as soon as they change. */
export function FocusSettingsCard() {
  const profile = useProfile()
  const save = useSaveSettings()
  const { focus, tollbooth } = readSettings(profile.data?.settings)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Focus settings</CardTitle>
        <CardDescription>Saved as soon as you change them.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Choices
          label="One-tap Start focus uses"
          value={focus.defaultMode}
          options={MODES.map((mode) => ({ value: mode, label: TIMER_LABEL[mode] }))}
          onChange={(defaultMode) => save.mutate({ focus: { defaultMode } })}
        />
        <Choices label="Block apps during" value={focus.blockDuring} options={[...BLOCK_DURING]} onChange={(blockDuring) => save.mutate({ focus: { blockDuring } })} />
        <div className="flex items-start gap-2">
          <Checkbox id="focus-idle-check" className="mt-0.5" checked={focus.idleCheck} onCheckedChange={(value) => save.mutate({ focus: { idleCheck: value === true } })} />
          <Label htmlFor="focus-idle-check" className="grid gap-0.5 font-normal">
            <span className="font-medium">Idle check</span>
            <span className="text-muted-foreground">Study sessions pause after 4 minutes without a tap, scroll or key press.</span>
          </Label>
        </div>
        <Choices
          label="An emergency unlock lasts"
          value={tollbooth.unlockMinutes}
          options={[3, 4, 5].map((minutes) => ({ value: minutes, label: `${minutes} min` }))}
          onChange={(unlockMinutes) => save.mutate({ tollbooth: { unlockMinutes } })}
        />
        <Choices
          label="Emergency unlocks a day"
          value={tollbooth.dailyLimit}
          options={[0, 1, 2, 3, 5].map((count) => ({ value: count, label: count === 0 ? 'None' : String(count) }))}
          onChange={(dailyLimit) => save.mutate({ tollbooth: { dailyLimit } })}
        />
        {save.error && (
          <p role="alert" className="text-sm text-destructive">
            {save.error.message}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
