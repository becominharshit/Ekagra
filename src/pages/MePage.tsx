import { useState } from 'react'
import { LogOut, RotateCcw, SlidersHorizontal, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { signOut } from '@/features/auth/auth'
import { useAuthStore } from '@/features/auth/authStore'
import { ModeSimulator } from '@/features/mode/ModeSimulator'
import { useProfile, useResetDemoData, useRoutine } from '@/features/profile/queries'
import {
  CHRONOTYPE_LABEL,
  MENTOR_TONE_LABEL,
  peakWindowFor,
  readSettings,
  toChronotype,
  toMentorTone,
} from '@/features/profile/settings'

const COMING = [{ title: 'FocusGuard setup and blocked apps', when: 'M9' }]

export function MePage() {
  return (
    <>
      <PageHeader title="Me" subtitle="Your profile and settings." />
      <div className="grid gap-4">
        <AccountCard />
        <PlanSettingsCard />
        <ModeSimulator />

        <Card>
          <CardHeader>
            <CardTitle>Coming to Me</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2">
              {COMING.map((item) => (
                <li key={item.title} className="flex items-center justify-between gap-3">
                  <span>{item.title}</span>
                  <Badge variant="secondary">{item.when}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
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
  const isDemo = useAuthStore((state) => state.status === 'demo')

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
        {isDemo && <ResetDemoButton />}
      </CardContent>
    </Card>
  )
}

/** Demo Mode only: start again from an empty demo profile (asks first). */
function ResetDemoButton() {
  const resetDemoData = useResetDemoData()

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className="text-destructive">
          <RotateCcw aria-hidden />
          Reset demo data
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset demo data?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes the demo profile, routine and time budget from this device. You'll go through setup again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep my data</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => void resetDemoData()}>
            Reset
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
