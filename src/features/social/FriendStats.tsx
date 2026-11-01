import { format, parseISO } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { minutesLabel } from '@/features/academics/labels'
import { sharedLines, type SharedView } from './social'

/** "Studying now, until 18:20" while a friend's focus session runs. */
export function StudyingBadge({ stats }: { stats: Pick<SharedView, 'studying_now' | 'studying_until'> | null }) {
  if (!stats?.studying_now || !stats.studying_until) return null
  return <Badge className="shrink-0 bg-mode-study/15 text-mode-study">Studying now, until {format(parseISO(stats.studying_until), 'HH:mm')}</Badge>
}

/** A friend's shared numbers in one line: focus this week, streak, plan done. */
export function FriendNumbers({ stats, weekStart }: { stats: SharedView | null; weekStart: string }) {
  if (!stats) return <p className="text-xs text-muted-foreground">Hasn't chosen what to share yet.</p>
  const lines = sharedLines(stats, weekStart)
  const parts = [
    lines.focusMinutes === null ? null : `${minutesLabel(lines.focusMinutes)} focus this week`,
    lines.streakDays === null ? null : `${lines.streakDays}-day streak`,
    lines.planPct === null ? null : `${lines.planPct}% of the plan done`,
  ].filter((part): part is string => part !== null)
  return <p className="text-xs text-muted-foreground">{parts.length > 0 ? parts.join(' · ') : 'Shares no numbers.'}</p>
}
