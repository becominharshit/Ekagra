import { formatDistanceToNow, parseISO } from 'date-fns'
import { Hand } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { nudgeText } from './social'
import { markNudgesSeen, useMyStats, useNudges, useSocialMutation } from './socialData'

/** Nudges from partners and group mates that haven't been seen yet (Today, and Partner and groups). */
export function NudgesCard() {
  const stats = useMyStats()
  const nudges = useNudges(Boolean(stats.data))
  const seen = useSocialMutation(markNudgesSeen)
  const unseen = (nudges.data?.received ?? []).filter((nudge) => !nudge.seen_at)
  if (unseen.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Hand className="size-4" aria-hidden />
          {unseen.length === 1 ? 'A nudge from a friend' : `${unseen.length} nudges from friends`}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <ul className="grid gap-2 text-sm">
          {unseen.slice(0, 5).map((nudge) => {
            const text = nudgeText(nudge, nudge.from)
            return (
              <li key={nudge.id} className="grid gap-0.5">
                <p className="font-medium">{text.title}</p>
                <p>{text.body}</p>
                <p className="text-xs text-muted-foreground">{formatDistanceToNow(parseISO(nudge.created_at), { addSuffix: true })}</p>
              </li>
            )
          })}
        </ul>
        <Button className="justify-self-start" variant="outline" disabled={seen.isPending} onClick={() => seen.mutate(unseen.map((nudge) => nudge.id))}>
          Got it
        </Button>
        {seen.error && (
          <p role="alert" className="text-sm text-destructive">
            {seen.error.message}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
