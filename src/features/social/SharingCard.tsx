import { useState, type FormEvent } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { minutesLabel } from '@/features/academics/labels'
import { readSharing, toPublished, type MyNumbers, type SharedStats, type Sharing } from './social'
import { saveMyStats, useSocialMutation } from './socialData'

type Choice = Exclude<keyof Sharing, 'displayName'>

/** What you share with your partners and group mates: a name and the numbers you pick. */
export function SharingCard({ stats, numbers }: { stats: SharedStats; numbers: MyNumbers | null }) {
  const sharing = readSharing(stats)
  const [name, setName] = useState(sharing.displayName)
  const save = useSocialMutation(saveMyStats)

  function change(next: Sharing) {
    save.mutate(toPublished(next, numbers, next.studying ? stats.studying_until : null))
  }

  function toggle(choice: Choice, on: boolean) {
    const next = { ...sharing, [choice]: on }
    // The leaderboard ranks focus minutes, so it needs them shared.
    if (choice === 'leaderboard' && on) next.focus = true
    if (choice === 'focus' && !on) next.leaderboard = false
    change(next)
  }

  function rename(event: FormEvent) {
    event.preventDefault()
    if (name.trim()) change({ ...sharing, displayName: name })
  }

  const choices: { key: Choice; label: string; detail: string }[] = [
    { key: 'focus', label: 'Focus minutes this week', detail: numbers ? `${minutesLabel(numbers.focusMinutes)} so far` : '' },
    { key: 'streak', label: 'Study streak', detail: numbers ? `${numbers.streakDays}-day streak (days with 15+ minutes of focus)` : 'Days in a row with 15+ minutes of focus' },
    { key: 'plan', label: 'Plan done this week', detail: numbers?.planPct == null ? 'No blocks finished yet this week' : `${numbers.planPct}% of the blocks that ended` },
    { key: 'studying', label: 'Studying now', detail: 'While a focus session runs, so friends can join in' },
    { key: 'leaderboard', label: 'Show me on group leaderboards', detail: "Ranks this week's focus minutes in your groups" },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>What you share</CardTitle>
        <CardDescription>Only your partners and the people in your groups see these, and only the ones you tick. Your plan, notes and everything else stay private.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form className="flex flex-wrap items-end gap-2" onSubmit={rename}>
          <Label className="grid gap-1.5 font-normal">
            <span className="text-sm text-muted-foreground">Your name for friends</span>
            <Input className="w-48" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
          </Label>
          <Button type="submit" variant="outline" disabled={save.isPending || !name.trim() || name.trim() === sharing.displayName}>
            Save name
          </Button>
        </form>
        <div className="grid gap-3">
          {choices.map((choice) => (
            <Label key={choice.key} className="flex items-start gap-2 font-normal">
              <Checkbox className="mt-0.5" checked={sharing[choice.key]} disabled={save.isPending} onCheckedChange={(checked) => toggle(choice.key, checked === true)} />
              <span className="grid gap-0.5">
                <span>{choice.label}</span>
                {choice.detail && <span className="text-xs text-muted-foreground">{choice.detail}</span>}
              </span>
            </Label>
          ))}
        </div>
        {save.isPending && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <LoaderCircle className="size-3 animate-spin" aria-hidden />
            Saving…
          </p>
        )}
        {save.error && (
          <p role="alert" className="text-sm text-destructive">
            {save.error.message}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
