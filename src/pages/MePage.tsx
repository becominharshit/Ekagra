import { useState } from 'react'
import { CalendarCheck2, LockKeyhole, LogOut, ShieldCheck, SlidersHorizontal, UserRound, Users } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { signOut } from '@/features/auth/auth'
import { AiUsageCard } from '@/features/ai/AiUsageCard'
import { useAuthStore } from '@/features/auth/authStore'
import { FeedbackCard } from '@/features/feedback/FeedbackCard'
import { blockedPackages, useBlockedApps } from '@/features/focus/blockedApps'
import { useProfile, useRoutine } from '@/features/profile/queries'
import {
  CHRONOTYPE_LABEL,
  MENTOR_TONE_LABEL,
  peakWindowFor,
  readSettings,
  toChronotype,
  toMentorTone,
} from '@/features/profile/settings'

export function MePage() {
  return (
    <>
      <PageHeader title="Me" subtitle="Your profile and settings." />
      <div className="grid gap-4">
        <AccountCard />
        <ReviewCard />
        <FriendsCard />
        <PlanSettingsCard />
        <FocusCard />
        <AiUsageCard />
        <FeedbackCard />
      </div>
    </>
  )
}

/** The weekly review: every Sunday (or the day picked), 5 minutes. */
function ReviewCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly review</CardTitle>
        <CardDescription>Every Sunday (or the day you pick): your week in numbers, 3 insights and up to 3 changes for next week, in 5 minutes.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link to="/me/review">
            <CalendarCheck2 aria-hidden />
            Open the weekly review
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

/** Accountability partners and study groups. */
function FriendsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Partner and groups</CardTitle>
        <CardDescription>Study with friends: share a few numbers you pick, nudge each other and focus together.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link to="/me/friends">
            <Users aria-hidden />
            Open partner and groups
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

/** Focus and app blocking: FocusGuard setup, blocked apps and the focus settings. */
function FocusCard() {
  const blocked = useBlockedApps()
  const count = blockedPackages(blocked.data ?? []).length
  return (
    <Card>
      <CardHeader>
        <CardTitle>Focus and app blocking</CardTitle>
        <CardDescription>
          {count === 0 ? 'No apps blocked yet.' : `${count} ${count === 1 ? 'app' : 'apps'} blocked during focus.`} FocusGuard setup, the timer and the emergency unlock.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link to="/me/focus">
            <ShieldCheck aria-hidden />
            Set up focus and app blocking
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

/** Who is signed in, with Sign out (or Exit Demo Mode). */
function AccountCard() {
  const user = useAuthStore((state) => state.user)
  const isDemo = useAuthStore((state) => state.status === 'demo')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function leave() {
    setBusy(true)
    setError(null)
    try {
      await signOut()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign out. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="grid gap-3">
        <div className="flex items-center gap-3">
          {user?.avatarUrl ? (
            // Google photos may refuse to load when the browser sends a referrer.
            <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-12 rounded-full object-cover" />
          ) : (
            <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <UserRound aria-hidden />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{user?.name ?? 'Student'}</p>
            <p className="truncate text-sm text-muted-foreground">
              {isDemo ? 'Demo Mode: everything stays on this device' : user?.email}
            </p>
          </div>
        </div>
        <Button asChild variant="outline">
          <Link to="/me/account">
            <LockKeyhole aria-hidden />
            {isDemo ? 'Privacy, export and reset' : 'Privacy, export and delete'}
          </Link>
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => void leave()}>
          <LogOut aria-hidden />
          {isDemo ? 'Exit Demo Mode' : 'Sign out'}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/** The routine, rhythm and time budget from onboarding, with a way to change them. */
function PlanSettingsCard() {
  const navigate = useNavigate()
  const profile = useProfile()
  const routine = useRoutine()

  // RequireAuth has already loaded the profile before this page shows.
  if (!profile.data) return null
  const settings = readSettings(profile.data.settings)
  const chronotype = toChronotype(profile.data.chronotype)
  const peak = peakWindowFor(settings, chronotype)
  const { academics, hustle, life } = settings.budget

  return (
    <Card>
      <CardHeader>
        <CardTitle>Routine and time budget</CardTitle>
        <CardDescription>What the planner uses to plan your days.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Time budget</dt>
          <dd>
            Academics {academics}% · Hustle {hustle}% · Life {life}%
          </dd>
          <dt className="text-muted-foreground">Rhythm</dt>
          <dd>
            {CHRONOTYPE_LABEL[chronotype]}, best focus {peak.start}–{peak.end}
          </dd>
          <dt className="text-muted-foreground">Mentor style</dt>
          <dd>{MENTOR_TONE_LABEL[toMentorTone(profile.data.mentor_tone)]}</dd>
          <dt className="text-muted-foreground">Fixed times</dt>
          <dd>{routine.data ? `${routine.data.length} repeating blocks` : 'Loading…'}</dd>
        </dl>
        <Button variant="outline" onClick={() => navigate('/onboarding')}>
          <SlidersHorizontal aria-hidden />
          Edit routine and budget
        </Button>
      </CardContent>
    </Card>
  )
}
