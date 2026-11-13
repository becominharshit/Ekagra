import { useState, type FormEvent } from 'react'
import { Copy, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useNow, useTimezone } from '@/hooks/useNow'
import { formatShortDateInTimezone } from '@/lib/timezone'
import { FriendNumbers, StudyingBadge } from './FriendStats'
import { FriendSafetyActions, SafetyDialog, type SafetyTarget } from './SafetyDialogs'
import { formatCode, isCode, NUDGE_KINDS, NUDGE_LABEL, nudgesLeft } from './social'
import { acceptPartnerCode, partnerCode, removePartner, sendNudge, useNudges, usePartners, useSocialMutation } from './socialData'

/** Partners with their shared numbers and nudges, safety controls, and inviting or joining with a code. */
export function PartnerCard({ weekStart, demo }: { weekStart: string; demo: boolean }) {
  const now = useNow(60_000)
  const partners = usePartners()
  const nudges = useNudges()
  const nudge = useSocialMutation(sendNudge)
  const remove = useSocialMutation(removePartner)
  const [sent, setSent] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [safetyTarget, setSafetyTarget] = useState<SafetyTarget | null>(null)
  const list = partners.data ?? []
  const problem = partners.error ?? nudge.error ?? remove.error

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accountability partner</CardTitle>
        <CardDescription>A friend who sees your numbers and keeps you going, and you them. Up to 5 partners.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {partners.isPending && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Loading…
          </p>
        )}
        {!partners.isPending && list.length === 0 && <p className="text-sm text-muted-foreground">No partner yet. Get a code below and send it to a friend.</p>}
        {list.length > 0 && (
          <ul className="grid gap-3">
            {list.map((friend) => {
              const left = friend.sample ? 3 : nudgesLeft(nudges.data?.sent ?? [], friend.userId, now)
              return (
                <li key={friend.userId} className="grid gap-2 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{friend.name}</p>
                    <StudyingBadge stats={friend.stats} />
                  </div>
                  <FriendNumbers stats={friend.stats} weekStart={weekStart} />
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Nudge ${friend.name}`}>
                    {NUDGE_KINDS.map((kind) => (
                      <Button
                        key={kind}
                        size="sm"
                        variant="outline"
                        disabled={nudge.isPending || left === 0}
                        onClick={() =>
                          nudge.mutate(
                            { to: friend.userId, kind },
                            { onSuccess: () => setSent(friend.sample ? `${friend.name} is a sample: in Demo Mode nudges aren't sent.` : `Nudge sent to ${friend.name}.`) },
                          )
                        }
                      >
                        {NUDGE_LABEL[kind]}
                      </Button>
                    ))}
                    <FriendSafetyActions
                      userId={friend.userId}
                      name={friend.name}
                      contextType="partner"
                      onSelect={setSafetyTarget}
                    />
                    {!friend.sample &&
                      (removing === friend.userId ? (
                        <span className="flex items-center gap-1.5 text-sm">
                          Stop being partners?
                          <Button size="sm" variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate(friend.userId, { onSuccess: () => setRemoving(null) })}>
                            Yes
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setRemoving(null)}>
                            No
                          </Button>
                        </span>
                      ) : (
                        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setRemoving(friend.userId)}>
                          Remove
                        </Button>
                      ))}
                  </div>
                  {left === 0 && <p className="text-xs text-muted-foreground">You've nudged {friend.name} 3 times today: try again tomorrow.</p>}
                </li>
              )
            })}
          </ul>
        )}
        {sent && (
          <p role="status" className="text-sm text-muted-foreground">
            {sent}
          </p>
        )}
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem.message}
          </p>
        )}
        <InvitePanel demo={demo} />
      </CardContent>
      <SafetyDialog
        target={safetyTarget}
        onOpenChange={(open) => !open && setSafetyTarget(null)}
        onSubmitted={(msg) => setSent(msg)}
      />
    </Card>
  )
}

function InvitePanel({ demo }: { demo: boolean }) {
  const timeZone = useTimezone()
  const code = useSocialMutation((source, fresh: boolean) => partnerCode(source, { fresh }))
  const accept = useSocialMutation(acceptPartnerCode)
  const [typed, setTyped] = useState('')
  const [copied, setCopied] = useState(false)

  function join(event: FormEvent) {
    event.preventDefault()
    accept.mutate(typed, { onSuccess: () => setTyped('') })
  }

  return (
    <div className="grid gap-4 border-t pt-4">
      <div className="grid gap-2">
        <p className="text-sm font-medium">Invite a partner</p>
        {code.data ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xl font-semibold tracking-widest">{formatCode(code.data.code)}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText(`Be my study partner on Ekagra: open Me → Partner and groups and enter the code ${formatCode(code.data.code)}`)
                    .then(() => setCopied(true))
                    .catch(() => undefined)
                }
              >
                <Copy aria-hidden />
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button size="sm" variant="ghost" disabled={code.isPending} onClick={() => code.mutate(true, { onSuccess: () => setCopied(false) })}>
                New code
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {demo
                ? "In Demo Mode this is a sample code: it can't connect anyone. Sign in to invite a friend."
                : `Send it to your friend. It works once, until ${formatShortDateInTimezone(code.data.expiresAt, timeZone)}.`}
            </p>
          </>
        ) : (
          <Button variant="outline" className="justify-self-start" disabled={code.isPending} onClick={() => code.mutate(false)}>
            {code.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
            Get a code
          </Button>
        )}
      </div>
      <form className="flex flex-wrap items-end gap-2" onSubmit={join}>
        <Label className="grid gap-1.5 font-normal">
          <span className="text-sm text-muted-foreground">Have a friend's code?</span>
          <Input className="w-44 font-mono uppercase" placeholder="7F3A9 C21B4" value={typed} maxLength={14} onChange={(event) => setTyped(event.target.value)} />
        </Label>
        <Button type="submit" disabled={!isCode(typed) || accept.isPending}>
          {accept.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
          Become partners
        </Button>
      </form>
      {accept.isSuccess && (
        <p role="status" className="text-sm text-muted-foreground">
          You're partners now.
        </p>
      )}
      {(code.error ?? accept.error) && (
        <p role="alert" className="text-sm text-destructive">
          {(code.error ?? accept.error)?.message}
        </p>
      )}
    </div>
  )
}
