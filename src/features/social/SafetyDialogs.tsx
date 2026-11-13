import { useState, type FormEvent } from 'react'
import { Ban, Flag, LoaderCircle, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useTimezone } from '@/hooks/useNow'
import { formatShortDateInTimezone } from '@/lib/timezone'
import {
  ABUSE_CATEGORIES,
  ABUSE_CATEGORY_LABEL,
  blockUser,
  submitAbuseReport,
  unblockUser,
  useBlockedUsers,
  useSafetyMutation,
  type AbuseCategory,
  type AbuseContextType,
} from './safety'

export interface SafetyTarget {
  userId: string
  name: string
  contextType: AbuseContextType
  contextId?: string | null
  initialAction: 'block' | 'report'
}

/** Inline Block / Report buttons rendered for a friend or study-group member. */
export function FriendSafetyActions({
  userId,
  name,
  contextType,
  contextId,
  onSelect,
}: {
  userId: string
  name: string
  contextType: AbuseContextType
  contextId?: string | null
  onSelect: (target: SafetyTarget) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Report ${name}`}
        onClick={() => onSelect({ userId, name, contextType, contextId, initialAction: 'report' })}
      >
        <Flag className="size-3.5" aria-hidden />
        Report
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Block ${name}`}
        onClick={() => onSelect({ userId, name, contextType, contextId, initialAction: 'block' })}
      >
        <Ban className="size-3.5" aria-hidden />
        Block
      </Button>
    </div>
  )
}

/** Modal dialog for blocking a user or submitting an abuse report (with optional immediate block). */
export function SafetyDialog({
  target,
  onOpenChange,
  onSubmitted,
}: {
  target: SafetyTarget | null
  onOpenChange: (open: boolean) => void
  onSubmitted?: (message: string) => void
}) {
  const blockMut = useSafetyMutation(blockUser)
  const reportMut = useSafetyMutation(submitAbuseReport)
  const [category, setCategory] = useState<AbuseCategory>('harassment')
  const [details, setDetails] = useState('')
  const [alsoBlock, setAlsoBlock] = useState(true)

  const open = target !== null
  const isBlock = target?.initialAction === 'block'
  const busy = blockMut.isPending || reportMut.isPending
  const error = blockMut.error ?? reportMut.error

  function reset() {
    setCategory('harassment')
    setDetails('')
    setAlsoBlock(true)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!target) return
    if (isBlock) {
      blockMut.mutate(
        { targetUserId: target.userId, displayName: target.name, reason: details },
        {
          onSuccess: () => {
            onSubmitted?.(`Blocked ${target.name}. You can unblock them anytime below.`)
            reset()
            onOpenChange(false)
          },
        },
      )
      return
    }
    reportMut.mutate(
      {
        reportedUserId: target.userId,
        reportedName: target.name,
        category,
        contextType: target.contextType,
        contextId: target.contextId ?? null,
        details,
        alsoBlock,
      },
      {
        onSuccess: () => {
          onSubmitted?.(alsoBlock ? `Report submitted and ${target.name} was blocked.` : `Report submitted for review.`)
          reset()
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isBlock ? <Ban className="size-4" aria-hidden /> : <Flag className="size-4" aria-hidden />}
              {isBlock ? `Block ${target?.name ?? 'user'}?` : `Report ${target?.name ?? 'user'}`}
            </DialogTitle>
            <DialogDescription>
              {isBlock
                ? 'Blocking ends any partnership, clears mutual nudges, hides your study stats from them, and blocks group or partner invites between you.'
                : 'Tell us what went wrong. Your report is kept private and reviewed by Ekagra safety.'}
            </DialogDescription>
          </DialogHeader>

          {!isBlock && (
            <div className="grid gap-1.5">
              <Label htmlFor="abuse-category">Reason</Label>
              <Select value={category} onValueChange={(next) => setCategory(next as AbuseCategory)}>
                <SelectTrigger id="abuse-category" aria-label="Report reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ABUSE_CATEGORIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {ABUSE_CATEGORY_LABEL[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="safety-details">{isBlock ? 'Private note (optional)' : 'Details (optional)'}</Label>
            <Textarea
              id="safety-details"
              rows={3}
              maxLength={isBlock ? 300 : 2000}
              placeholder={isBlock ? 'Why are you blocking this person?' : 'Describe what happened…'}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
            />
          </div>

          {!isBlock && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 rounded border"
                checked={alsoBlock}
                onChange={(event) => setAlsoBlock(event.target.checked)}
              />
              <span>Also block {target?.name ?? 'this user'} immediately</span>
            </label>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error.message}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy && <LoaderCircle className="animate-spin" aria-hidden />}
              {isBlock ? 'Block user' : 'Submit report'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Lists blocked users on FriendsPage so the student can review and unblock them anytime. */
export function BlockedUsersCard() {
  const timeZone = useTimezone()
  const blocked = useBlockedUsers()
  const unblock = useSafetyMutation(unblockUser)
  const list = blocked.data ?? []

  if (!blocked.isPending && list.length === 0 && !blocked.error && !unblock.error) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="size-4" aria-hidden />
          Blocked users
        </CardTitle>
        <CardDescription>Blocked users cannot see your study stats, send nudges, accept your invites, or share study groups with you.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {blocked.isPending && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Loading…
          </p>
        )}
        {(blocked.error ?? unblock.error) && (
          <p role="alert" className="text-sm text-destructive">
            {(blocked.error ?? unblock.error)?.message}
          </p>
        )}
        {list.length > 0 && (
          <ul className="grid gap-2">
            {list.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <div className="grid gap-0.5">
                  <span className="font-medium">{entry.displayName ?? `User ${entry.blockedUserId.slice(0, 8)}`}</span>
                  <span className="text-xs text-muted-foreground">
                    Blocked {formatShortDateInTimezone(entry.createdAt, timeZone)}
                    {entry.reason ? ` · ${entry.reason}` : ''}
                  </span>
                </div>
                <Button size="sm" variant="outline" disabled={unblock.isPending} onClick={() => unblock.mutate(entry.blockedUserId)}>
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
