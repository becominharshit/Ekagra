import { useEffect, useState } from 'react'
import { CalendarDays, FlaskConical, LoaderCircle, NotebookPen, Target, TrendingUp } from 'lucide-react'
import { Link, Navigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { clearAccountNotice, readAccountNotice } from '@/features/account/notice'
import { signInWithGoogle } from '@/features/auth/auth'
import { useAuthStore } from '@/features/auth/authStore'
import { isSupabaseConfigured } from '@/lib/supabase'

const FEATURES = [
  { icon: CalendarDays, title: 'A plan for today', text: 'Your syllabus, deadlines and energy in one clear next step.' },
  { icon: NotebookPen, title: 'Notes that make sense', text: 'Full notes, flowchart mind maps and one-page revision sheets.' },
  { icon: Target, title: 'Skills beside studies', text: 'A side hustle plan that fits around your college timetable.' },
  { icon: TrendingUp, title: 'Progress you can see', text: 'Weekly reviews that change the plan when something is not working.' },
]

/** The first screen: what Ekagra is, and sign-in (Google) or Demo Mode. */
export function SignInPage() {
  const status = useAuthStore((state) => state.status)
  const storeError = useAuthStore((state) => state.error)
  const startDemo = useAuthStore((state) => state.startDemo)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // E.g. "Your account and all its data were deleted." (shown once).
  const [notice] = useState(readAccountNotice)
  useEffect(() => clearAccountNotice(), [])

  if (status === 'signed_in' || status === 'demo') return <Navigate to="/today" replace />

  async function continueWithGoogle() {
    setBusy(true)
    setError(null)
    try {
      await signInWithGoogle()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const googleButton = (
    <Button
      key="google"
      size="lg"
      variant={isSupabaseConfigured ? 'default' : 'outline'}
      disabled={!isSupabaseConfigured || busy}
      onClick={() => void continueWithGoogle()}
    >
      {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <GoogleLogo />}
      Continue with Google
    </Button>
  )
  const demoButton = (
    <Button key="demo" size="lg" variant={isSupabaseConfigured ? 'outline' : 'default'} onClick={startDemo}>
      <FlaskConical aria-hidden />
      Try Demo Mode
    </Button>
  )
  const problem = error ?? storeError

  return (
    <main className="pt-safe pb-safe relative isolate min-h-full overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse at 8% 0%, rgb(37 99 235 / 13%), transparent 55%), radial-gradient(ellipse at 95% 90%, rgb(16 185 129 / 9%), transparent 50%)',
        }}
      />
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-5">
        <header className="flex items-center justify-between py-6">
          <Link to="/sign-in" className="flex items-center gap-2.5" aria-label="Ekagra home">
            <img src="/favicon.svg" alt="" className="size-9" />
            <span className="font-heading text-xl font-semibold tracking-tight">Ekagra</span>
          </Link>
          <Link to="/privacy" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Privacy
          </Link>
        </header>

        <div className="grid flex-1 items-center gap-12 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:py-16">
          <section>
            <p className="inline-flex items-center gap-2 rounded-full bg-mode-study/10 px-3 py-1 text-xs font-medium text-mode-study">
              <span className="size-1.5 rounded-full bg-mode-study" aria-hidden />
              Studies, skills and life in one place
            </p>
            <h1 className="mt-5 font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              One clear next step.
              <br />
              <span className="text-mode-study">Every day.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Ekagra turns your syllabus, deadlines and side hustle into a calm daily plan, with notes and revision made for the way you actually study.
            </p>
            <ul className="mt-9 grid max-w-xl gap-x-8 gap-y-5 sm:grid-cols-2">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-3">
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-mode-study/10 text-mode-study">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <Card className="w-full max-w-md justify-self-center border-foreground/10 shadow-xl shadow-mode-study/10 lg:justify-self-end">
            <CardHeader>
              <CardTitle className="font-heading text-2xl">Start where you are</CardTitle>
              <CardDescription>Sign in to keep your plan, notes and progress on every device.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {notice && (
                <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm">
                  {notice}
                </p>
              )}
              {/* Without Supabase, Demo Mode is the main button. */}
              {isSupabaseConfigured ? [googleButton, demoButton] : [demoButton, googleButton]}
              <p className="text-sm text-muted-foreground">
                {isSupabaseConfigured
                  ? 'Demo Mode needs no account. It keeps everything on this device, and nothing is sent to a server.'
                  : 'Google sign-in turns on once Supabase is connected (see docs/4-setup-guide.md). Demo Mode works now.'}
              </p>
              {problem && (
                <p role="alert" className="text-sm text-destructive">
                  {problem}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">Free to start. Your data stays yours.</p>
            </CardContent>
          </Card>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 py-6 text-xs text-muted-foreground">
          <p>Built for students in India. Your data stays yours.</p>
          <Link to="/privacy" className="underline underline-offset-3 hover:text-foreground">
            Privacy policy and permissions
          </Link>
        </footer>
      </div>
    </main>
  )
}

/** Google's "G" logo (Ekagra Studio's sign-in page uses it too). */
export function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3.01c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A12 12 0 0 0 12 24z"
      />
      <path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.61H1.27a12 12 0 0 0 0 10.78l4-3.11z" />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.27 6.61l4 3.11C6.22 6.88 8.87 4.77 12 4.77z"
      />
    </svg>
  )
}
