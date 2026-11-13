import { useState, type FormEvent } from 'react'
import { Copy, LoaderCircle, Timer, Trophy } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { minutesLabel } from '@/features/academics/labels'
import { startFocus, useActiveFocus } from '@/features/focus/sessions'
import { useTodayMutation } from '@/features/today/todayMutation'
import { useNow, useTimezone } from '@/hooks/useNow'
import { clockInTimezone } from '@/lib/timezone'
import { cn } from '@/lib/utils'
import { FriendNumbers } from './FriendStats'
import { FriendSafetyActions, SafetyDialog, type SafetyTarget } from './SafetyDialogs'
import { GROUP_FOCUS_MINUTES, groupNameProblem, leaderboard, minutesLeft, runningSession, studyingNow, type GroupView } from './groups'
import { createGroup, joinGroup, leaveGroup, newGroupCode, removeMember, startGroupFocus, useGroups } from './groupsData'
import { formatCode, isCode } from './social'
import { useSocialMutation } from './socialData'

/** Study groups: who's studying now, group focus, the leaderboard and members; making or joining one. */
export function GroupsCard({ weekStart }: { weekStart: string }) {
  const groups = useGroups()
  const list = groups.data ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Study groups</CardTitle>
        <CardDescription>See who's studying now, focus together and keep an eye on the week's leaderboard. Up to 30 students in a group.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {groups.isPending && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Loading…
          </p>
        )}
        {groups.error && (
          <p role="alert" className="text-sm text-destructive">
            {groups.error.message}
          </p>
        )}
        {!groups.isPending && list.length === 0 && <p className="text-sm text-muted-foreground">You're not in a group yet. Make one for your friends, or join one with its code.</p>}
        {list.map((group) => (
          <GroupPanel key={group.id} group={group} weekStart={weekStart} />
        ))}
        <NewGroup />
      </CardContent>
    </Card>
  )
}

function GroupPanel({ group, weekStart }: { group: GroupView; weekStart: string }) {
  const now = useNow(30_000)
  const timeZone = useTimezone()
  const navigate = useNavigate()
  const active = useActiveFocus()
  const startOwn = useTodayMutation(startFocus)
  const startGroup = useSocialMutation(startGroupFocus)
  const leave = useSocialMutation(leaveGroup)
  const renew = useSocialMutation(newGroupCode)
  const remove = useSocialMutation(removeMember)
  const [leaving, setLeaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [safetyTarget, setSafetyTarget] = useState<SafetyTarget | null>(null)
  const [safetyNotice, setSafetyNotice] = useState<string | null>(null)
  const me = group.members.find((member) => member.me)
  const owner = me?.userId === group.ownerId
  const board = leaderboard(group.members, weekStart)
  const studying = studyingNow(group.members)
  const session = runningSession(group.sessions, now)
  const starter = session ? (group.members.find((member) => member.userId === session.user_id)?.name ?? 'Someone') : null
  const focusing = Boolean(active.data)
  const busy = startOwn.isPending || startGroup.isPending
  const problem = startOwn.error ?? startGroup.error ?? leave.error ?? renew.error ?? remove.error

  /** Starts your own focus session for these minutes, then opens the focus screen. */
  const focusFor = (minutes: number) => startOwn.mutate({ block: null, area: 'academics', mode: 'custom', workMinutes: minutes }, { onSuccess: () => navigate('/today/focus') })

  return (
    <section className="grid gap-3 rounded-lg border p-3" aria-label={group.name}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-heading font-semibold">{group.name}</h3>
        <span className="text-xs text-muted-foreground">{group.members.length === 1 ? '1 member' : `${group.members.length} members`}</span>
      </div>

      {studying.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Studying now">
          {studying.map((member) => (
            <Badge key={member.userId} className="bg-mode-study/15 text-mode-study">
              {member.name} until {clockInTimezone(member.stats?.studying_until ?? now, timeZone)}
            </Badge>
          ))}
        </div>
      )}

      <div className="grid gap-2 rounded-lg bg-muted/40 p-3 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <Timer className="size-4" aria-hidden />
          Group focus
        </p>
        {session ? (
          <>
            <p>
              {starter} started a {session.minutes}-minute group focus: {minutesLabel(minutesLeft(session, now))} left.
            </p>
            <Button size="sm" className="justify-self-start" disabled={busy || focusing} onClick={() => focusFor(minutesLeft(session, now))}>
              Join for the last {minutesLabel(minutesLeft(session, now))}
            </Button>
          </>
        ) : (
          <>
            <p className="text-muted-foreground">Start one and the group can join until it ends.</p>
            <div className="flex flex-wrap gap-1.5">
              {GROUP_FOCUS_MINUTES.map((minutes) => (
                <Button
                  key={minutes}
                  size="sm"
                  variant="outline"
                  disabled={busy || focusing}
                  onClick={() => startGroup.mutate({ groupId: group.id, minutes }, { onSuccess: () => focusFor(minutes) })}
                >
                  {minutes} min
                </Button>
              ))}
            </div>
          </>
        )}
        {focusing && <p className="text-xs text-muted-foreground">You're already in a focus session.</p>}
      </div>

      <div className="grid gap-1.5 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <Trophy className="size-4" aria-hidden />
          This week's leaderboard
        </p>
        {board.length === 0 ? (
          <p className="text-muted-foreground">Nobody is on it yet: members join it in "What you share".</p>
        ) : (
          <ol className="grid gap-1">
            {board.map((row) => (
              <li key={row.userId} className={cn('flex justify-between gap-2', row.me && 'font-semibold')}>
                <span>
                  {row.rank}. {row.name}
                </span>
                <span className="tabular-nums">{minutesLabel(row.minutes)}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-xs text-muted-foreground">Focus minutes this week; only members who chose to be on it.</p>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Members</summary>
        <ul className="mt-2 grid gap-2">
          {group.members.map((member) => (
            <li key={member.userId} className="flex items-start justify-between gap-2">
              <span className="grid gap-0.5">
                <span>
                  {member.name}
                  {member.role === 'owner' && <span className="text-xs text-muted-foreground"> · owner</span>}
                </span>
                <FriendNumbers stats={member.stats} weekStart={weekStart} />
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {!member.me && (
                  <FriendSafetyActions
                    userId={member.userId}
                    name={member.name}
                    contextType="group"
                    contextId={group.sample ? null : group.id}
                    onSelect={setSafetyTarget}
                  />
                )}
                {owner && !member.me && !group.sample && (
                  <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate({ groupId: group.id, userId: member.userId })}>
                    Remove
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </details>

      <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
        <span className="text-muted-foreground">Code to join:</span>
        <span className="font-mono font-semibold tracking-widest">{formatCode(group.code)}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            void navigator.clipboard
              ?.writeText(`Join my study group "${group.name}" on Ekagra: open Me → Partner and groups and enter the code ${formatCode(group.code)}`)
              .then(() => setCopied(true))
              .catch(() => undefined)
          }
        >
          <Copy aria-hidden />
          {copied ? 'Copied' : 'Copy'}
        </Button>
        {owner && !group.sample && (
          <Button size="sm" variant="ghost" disabled={renew.isPending} onClick={() => renew.mutate(group.id, { onSuccess: () => setCopied(false) })}>
            New code
          </Button>
        )}
        {!group.sample &&
          (leaving ? (
            <span className="ml-auto flex items-center gap-1.5">
              Leave the group?
              <Button size="sm" variant="destructive" disabled={leave.isPending} onClick={() => leave.mutate(group.id)}>
                Leave
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setLeaving(false)}>
                Stay
              </Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setLeaving(true)}>
              Leave
            </Button>
          ))}
      </div>
      {group.sample && <p className="text-xs text-muted-foreground">A sample group: its members and their numbers are made up, and its code doesn't work.</p>}
      {safetyNotice && (
        <p role="status" className="text-xs text-muted-foreground">
          {safetyNotice}
        </p>
      )}
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem.message}
        </p>
      )}
      <SafetyDialog
        target={safetyTarget}
        onOpenChange={(open) => !open && setSafetyTarget(null)}
        onSubmitted={(msg) => setSafetyNotice(msg)}
      />
    </section>
  )
}

function NewGroup() {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const create = useSocialMutation(createGroup)
  const join = useSocialMutation(joinGroup)
  const nameProblem = name ? groupNameProblem(name) : null

  function make(event: FormEvent) {
    event.preventDefault()
    create.mutate(name, { onSuccess: () => setName('') })
  }

  function enter(event: FormEvent) {
    event.preventDefault()
    join.mutate(code, { onSuccess: () => setCode('') })
  }

  return (
    <div className="grid gap-3 border-t pt-4">
      <form className="flex flex-wrap items-end gap-2" onSubmit={make}>
        <Label className="grid gap-1.5 font-normal">
          <span className="text-sm text-muted-foreground">Make a group</span>
          <Input className="w-56" placeholder="e.g. DBMS study circle" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
        </Label>
        <Button type="submit" variant="outline" disabled={!name.trim() || nameProblem !== null || create.isPending}>
          Make it
        </Button>
      </form>
      <form className="flex flex-wrap items-end gap-2" onSubmit={enter}>
        <Label className="grid gap-1.5 font-normal">
          <span className="text-sm text-muted-foreground">Join with a code</span>
          <Input className="w-44 font-mono uppercase" placeholder="9C4E1 B7A30" value={code} maxLength={14} onChange={(event) => setCode(event.target.value)} />
        </Label>
        <Button type="submit" variant="outline" disabled={!isCode(code) || join.isPending}>
          Join
        </Button>
      </form>
      {(create.error ?? join.error) && (
        <p role="alert" className="text-sm text-destructive">
          {(create.error ?? join.error)?.message}
        </p>
      )}
    </div>
  )
}
