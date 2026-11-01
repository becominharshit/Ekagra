import { Timer } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { minutesLabel } from '@/features/academics/labels'
import { startFocus, useActiveFocus } from '@/features/focus/sessions'
import { useTodayMutation } from '@/features/today/todayMutation'
import { useNow } from '@/hooks/useNow'
import { minutesLeft, runningSession } from './groups'
import { useGroups } from './groupsData'
import { useMyStats } from './socialData'

/** Today: a group focus going on in one of your groups, to join for the minutes left. */
export function GroupFocusTodayCard() {
  const now = useNow(30_000)
  const stats = useMyStats()
  const groups = useGroups(Boolean(stats.data))
  const active = useActiveFocus()
  const startOwn = useTodayMutation(startFocus)
  const navigate = useNavigate()
  const running = (groups.data ?? []).flatMap((group) => {
    const session = runningSession(group.sessions, now)
    return session ? [{ group, session }] : []
  })
  if (running.length === 0 || active.data) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Timer className="size-4" aria-hidden />
          Group focus now
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {running.map(({ group, session }) => {
          const starter = group.members.find((member) => member.userId === session.user_id)?.name ?? 'Someone'
          const left = minutesLeft(session, now)
          return (
            <div key={session.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {starter} in {group.name}: {minutesLabel(left)} left
              </span>
              <Button size="sm" disabled={startOwn.isPending} onClick={() => startOwn.mutate({ block: null, area: 'academics', mode: 'custom', workMinutes: left }, { onSuccess: () => navigate('/today/focus') })}>
                Join
              </Button>
            </div>
          )
        })}
        {startOwn.error && (
          <p role="alert" className="text-sm text-destructive">
            {startOwn.error.message}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
