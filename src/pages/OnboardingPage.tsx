import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, LoaderCircle } from 'lucide-react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { signOut } from '@/features/auth/auth'
import { useAuthStore } from '@/features/auth/authStore'
import { AboutStep } from '@/features/onboarding/AboutStep'
import { BudgetStep } from '@/features/onboarding/BudgetStep'
import { allProblems, draftFrom, problemsFor, resultFrom } from '@/features/onboarding/onboardingDraft'
import { RhythmStep } from '@/features/onboarding/RhythmStep'
import { RoutineStep } from '@/features/onboarding/RoutineStep'
import { recommendedCurriculumForLocale } from '@/features/academics/curriculum'
import { StarterPackPicker } from '@/features/academics/StarterPackPicker'
import {
  useProfile,
  useRoutine,
  useSaveOnboarding,
  useSkipOnboarding,
  type ProfileRow,
  type RoutineRow,
} from '@/features/profile/queries'
import { defaultCurrencyForLocale } from '@/lib/currency'
import { browserTimezone } from '@/lib/timezone'
import { cn } from '@/lib/utils'

const STEPS = [
  { title: 'About you', description: 'So your mentor knows who it is planning for.' },
  { title: 'Your weekly routine', description: 'The fixed parts of your week. Everything else is free time to plan.' },
  { title: 'Rhythm and mentor style', description: 'When you think best, and how your mentor should talk to you.' },
  { title: 'Time budget', description: 'How your free time is shared between studies, hustle and life.' },
] as const

/** The 4-step setup. Also used later from Me → "Edit routine and budget". */
export function OnboardingPage() {
  const profile = useProfile()
  const routine = useRoutine()

  if (profile.isPending || routine.isPending) {
    return (
      <p className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading…
      </p>
    )
  }
  if (profile.isError || routine.isError || !profile.data) {
    const message = profile.error?.message ?? routine.error?.message ?? 'Your profile could not be loaded.'
    return (
      <p role="alert" className="flex h-full items-center justify-center px-6 text-center text-sm text-destructive">
        {message}
      </p>
    )
  }
  return <OnboardingWizard profile={profile.data} routineRows={routine.data} />
}

function initialOnboardingDraft(profile: ProfileRow, routineRows: RoutineRow[]) {
  const base = draftFrom(profile, routineRows)
  if (profile.onboarded_at === null) {
    const detectedTimezone = browserTimezone()
    const detectedCurrency = defaultCurrencyForLocale()
    return {
      ...base,
      region: {
        curriculum: recommendedCurriculumForLocale(detectedTimezone),
        currency: detectedCurrency,
        timezone: detectedTimezone,
      },
    }
  }
  return base
}

function quickStartDismissKey(profileId: string): string {
  return `ekagra-quickstart-skipped-${profileId}`
}

function readQuickStartDismissed(profileId: string): boolean {
  try {
    return localStorage.getItem(quickStartDismissKey(profileId)) === '1'
  } catch {
    return false
  }
}

function saveQuickStartDismissed(profileId: string): void {
  try {
    localStorage.setItem(quickStartDismissKey(profileId), '1')
  } catch {
    // Storage unavailable: in-memory state still keeps the modal closed for this session.
  }
}

/** Skippable quick-start modal shown inside AppShell for brand-new accounts instead of blocking Today. */
export function QuickStartOnboardingModal() {
  const { pathname } = useLocation()
  const profile = useProfile()
  const routine = useRoutine()
  const [dismissedForId, setDismissedForId] = useState<string | null>(null)

  const profileRow = profile.data
  const routineRows = routine.data
  if (!profileRow || !routineRows) return null
  if (profileRow.onboarded_at !== null) return null
  if (pathname === '/onboarding') return null
  if (dismissedForId === profileRow.id || readQuickStartDismissed(profileRow.id)) return null

  return (
    <QuickStartModalBody
      profile={profileRow}
      routineRows={routineRows}
      onDismiss={() => {
        saveQuickStartDismissed(profileRow.id)
        setDismissedForId(profileRow.id)
      }}
    />
  )
}

function QuickStartModalBody({
  profile,
  routineRows,
  onDismiss,
}: {
  profile: ProfileRow
  routineRows: RoutineRow[]
  onDismiss: () => void
}) {
  const save = useSaveOnboarding()
  const skip = useSkipOnboarding()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState(() => initialOnboardingDraft(profile, routineRows))
  const [problems, setProblems] = useState<string[]>([])
  const isLast = step === STEPS.length - 1
  const current = STEPS[step] ?? STEPS[0]

  function handleSkip() {
    onDismiss()
    skip.mutate(profile)
  }

  function handleNext() {
    const issues = isLast ? allProblems(draft) : problemsFor(step, draft)
    setProblems(issues)
    if (issues.length > 0) return
    if (!isLast) {
      setStep(step + 1)
      return
    }
    save.mutate(resultFrom(draft, profile), {
      onSuccess: () => onDismiss(),
    })
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) handleSkip()
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <span className="text-xs font-medium text-muted-foreground">
              Quick setup · Step {step + 1} of {STEPS.length}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={handleSkip}>
              Skip for now
            </Button>
          </div>
          <DialogTitle>{current.title}</DialogTitle>
          <DialogDescription>{current.description}</DialogDescription>
        </DialogHeader>

        <ol className="grid grid-cols-4 gap-1.5" aria-label="Quick setup progress">
          {STEPS.map((item, index) => (
            <li
              key={item.title}
              aria-current={index === step ? 'step' : undefined}
              className={cn('h-1.5 rounded-full', index <= step ? 'bg-primary' : 'bg-muted')}
            >
              <span className="sr-only">{item.title}</span>
            </li>
          ))}
        </ol>

        <div>
          {step === 0 && (
            <div className="grid gap-4">
              <AboutStep
                value={draft.about}
                region={draft.region}
                onChange={(about) => setDraft({ ...draft, about })}
                onRegionChange={(region) => setDraft({ ...draft, region })}
              />
              <div className="grid gap-2 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground">1-click Starter Pack (optional)</p>
                <StarterPackPicker compact />
              </div>
            </div>
          )}
          {step === 1 && <RoutineStep value={draft.routine} onChange={(routine) => setDraft({ ...draft, routine })} />}
          {step === 2 && <RhythmStep value={draft.rhythm} onChange={(rhythm) => setDraft({ ...draft, rhythm })} />}
          {step === 3 && <BudgetStep value={draft.budget} onChange={(budget) => setDraft({ ...draft, budget })} />}
        </div>

        {(problems.length > 0 || save.error) && (
          <div role="alert" className="grid gap-1 text-sm text-destructive">
            {problems.map((problem) => (
              <p key={problem}>{problem}</p>
            ))}
            {save.error && <p>{save.error.message}</p>}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {step > 0 && (
            <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
              <ArrowLeft aria-hidden />
              Back
            </Button>
          )}
          <Button type="button" className="flex-1" disabled={save.isPending} onClick={handleNext}>
            {isLast && (save.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Check aria-hidden />)}
            {isLast ? 'Finish and plan my day' : 'Next'}
            {!isLast && <ArrowRight aria-hidden />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function OnboardingWizard({ profile, routineRows }: { profile: ProfileRow; routineRows: RoutineRow[] }) {
  const navigate = useNavigate()
  const save = useSaveOnboarding()
  const skip = useSkipOnboarding()
  const isDemo = useAuthStore((state) => state.status === 'demo')
  const [params] = useSearchParams()
  const editing = profile.onboarded_at !== null
  // "?step=routine" (from Attendance) opens the routine straight away when editing.
  const [step, setStep] = useState(() => (editing && params.get('step') === 'routine' ? 1 : 0))
  const [draft, setDraft] = useState(() => initialOnboardingDraft(profile, routineRows))
  const [problems, setProblems] = useState<string[]>([])
  const isLast = step === STEPS.length - 1
  const current = STEPS[step] ?? STEPS[0]

  function goTo(next: number) {
    setProblems([])
    setStep(next)
    window.scrollTo({ top: 0 })
  }

  function goNext() {
    const issues = isLast ? allProblems(draft) : problemsFor(step, draft)
    setProblems(issues)
    if (issues.length > 0) return
    if (!isLast) {
      goTo(step + 1)
      return
    }
    save.mutate(resultFrom(draft, profile), { onSuccess: () => navigate('/today', { replace: true }) })
  }

  /** The first time there's no Me tab yet, so leaving (e.g. wrong Google account) happens here. */
  function leave() {
    signOut().catch((error: unknown) => {
      setProblems([error instanceof Error ? error.message : 'Could not sign out. Please try again.'])
    })
  }

  return (
    <main id="main-content" tabIndex={-1} className="pt-safe pb-safe min-h-full focus:outline-none">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>
      <div className="mx-auto grid w-full max-w-lg gap-4 px-4 py-6">
        <div className="flex items-center justify-between gap-2">
          <span className="font-heading text-base font-semibold tracking-tight">Ekagra</span>
          {editing ? (
            <Button variant="ghost" onClick={() => navigate('/me')}>
              Cancel
            </Button>
          ) : (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                disabled={skip.isPending}
                onClick={() => {
                  saveQuickStartDismissed(profile.id)
                  skip.mutate(profile, { onSuccess: () => navigate('/today', { replace: true }) })
                }}
              >
                Skip for now
              </Button>
              <Button variant="ghost" onClick={leave}>
                {isDemo ? 'Exit demo' : 'Sign out'}
              </Button>
            </div>
          )}
        </div>

        <ol className="grid grid-cols-4 gap-1.5" aria-label="Progress">
          {STEPS.map((item, index) => (
            <li
              key={item.title}
              aria-current={index === step ? 'step' : undefined}
              className={cn('h-1.5 rounded-full', index <= step ? 'bg-primary' : 'bg-muted')}
            >
              <span className="sr-only">{item.title}</span>
            </li>
          ))}
        </ol>

        <Card>
          <CardHeader>
            <p className="text-xs text-muted-foreground">
              Step {step + 1} of {STEPS.length}
            </p>
            <CardTitle className="text-lg">{current.title}</CardTitle>
            <CardDescription>{current.description}</CardDescription>
          </CardHeader>
          <CardContent>
            {step === 0 && (
              <div className="grid gap-4">
                <AboutStep
                  value={draft.about}
                  region={draft.region}
                  onChange={(about) => setDraft({ ...draft, about })}
                  onRegionChange={(region) => setDraft({ ...draft, region })}
                />
                <div className="grid gap-2 border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground">1-click Starter Pack (optional)</p>
                  <StarterPackPicker compact />
                </div>
              </div>
            )}
            {step === 1 && <RoutineStep value={draft.routine} onChange={(routine) => setDraft({ ...draft, routine })} />}
            {step === 2 && <RhythmStep value={draft.rhythm} onChange={(rhythm) => setDraft({ ...draft, rhythm })} />}
            {step === 3 && <BudgetStep value={draft.budget} onChange={(budget) => setDraft({ ...draft, budget })} />}
          </CardContent>
        </Card>

        {(problems.length > 0 || save.error) && (
          <div role="alert" className="grid gap-1 text-sm text-destructive">
            {problems.map((problem) => (
              <p key={problem}>{problem}</p>
            ))}
            {save.error && <p>{save.error.message}</p>}
          </div>
        )}

        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="outline" onClick={() => goTo(step - 1)}>
              <ArrowLeft aria-hidden />
              Back
            </Button>
          )}
          <Button className="flex-1" disabled={save.isPending} onClick={goNext}>
            {isLast && (save.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Check aria-hidden />)}
            {isLast ? (editing ? 'Save changes' : 'Finish and plan my day') : 'Next'}
            {!isLast && <ArrowRight aria-hidden />}
          </Button>
        </div>
      </div>
    </main>
  )
}
