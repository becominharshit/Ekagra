import { useEffect, useState, type FormEvent } from 'react'
import { CalendarDays, FlaskConical, LoaderCircle, Mail, NotebookPen, Target, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { clearAccountNotice, readAccountNotice } from '@/features/account/notice'
import { requestPasswordReset, signInWithEmail, signInWithGoogle, signUpWithEmail } from '@/features/auth/auth'
import { useAuthStore } from '@/features/auth/authStore'
import { PublicTollboothPreview } from '@/features/focus/PublicTollboothPreview'
import { isSupabaseConfigured } from '@/lib/supabase'

const FEATURE_KEYS = [
  { icon: CalendarDays, key: 'plan' },
  { icon: NotebookPen, key: 'notes' },
  { icon: Target, key: 'skills' },
  { icon: TrendingUp, key: 'progress' },
] as const

/** Root entry (`/`): shows the public overview + Tollbooth preview when signed out, or routes signed-in/Demo users straight to `/today`. */
export function HomeGate() {
  const { t } = useTranslation('common')
  const status = useAuthStore((state) => state.status)
  if (status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        {t('loading')}
      </div>
    )
  }
  if (status === 'signed_in' || status === 'demo') return <Navigate to="/today" replace />
  return <SignInPage />
}

/** The first screen: what Ekagra is, and 1-click Google, email/password, or Demo Mode. */
export function SignInPage() {
  const { t } = useTranslation('common')
  const status = useAuthStore((state) => state.status)
  const storeError = useAuthStore((state) => state.error)
  const startDemo = useAuthStore((state) => state.startDemo)
  const [busy, setBusy] = useState(false)
  const [emailBusy, setEmailBusy] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [emailMode, setEmailMode] = useState<'signIn' | 'signUp'>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  // E.g. "Your account and all its data were deleted." (shown once).
  const [notice] = useState(readAccountNotice)
  useEffect(() => clearAccountNotice(), [])

  if (status === 'signed_in' || status === 'demo') return <Navigate to="/today" replace />

  async function continueWithGoogle() {
    setBusy(true)
    setError(null)
    setStatusMessage(null)
    try {
      await signInWithGoogle()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('signIn.signInFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function submitEmailAuth(event: FormEvent) {
    event.preventDefault()
    const cleanEmail = email.trim()
    if (!cleanEmail || !password) {
      setError(t('signIn.enterEmailAndPassword'))
      return
    }
    setEmailBusy(true)
    setError(null)
    setStatusMessage(null)
    try {
      if (emailMode === 'signIn') {
        await signInWithEmail(cleanEmail, password)
      } else {
        const result = await signUpWithEmail(cleanEmail, password)
        if (result.needsConfirmation) {
          setStatusMessage(t('signIn.signUpCheckEmail', { email: cleanEmail }))
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('signIn.signInFailed'))
    } finally {
      setEmailBusy(false)
    }
  }

  async function handleForgotPassword() {
    const cleanEmail = email.trim()
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError(t('signIn.enterEmailFirst'))
      setStatusMessage(null)
      return
    }
    setResetBusy(true)
    setError(null)
    setStatusMessage(null)
    try {
      await requestPasswordReset(cleanEmail)
      setStatusMessage(t('signIn.resetEmailSent', { email: cleanEmail }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('signIn.signInFailed'))
    } finally {
      setResetBusy(false)
    }
  }

  const anyBusy = busy || emailBusy || resetBusy
  const googleButton = (
    <Button
      key="google"
      size="lg"
      variant={isSupabaseConfigured ? 'default' : 'outline'}
      disabled={!isSupabaseConfigured || anyBusy}
      onClick={() => void continueWithGoogle()}
    >
      {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <GoogleLogo />}
      {t('signIn.continueGoogle')}
    </Button>
  )
  const demoButton = (
    <Button key="demo" size="lg" variant={isSupabaseConfigured ? 'outline' : 'default'} onClick={startDemo}>
      <FlaskConical aria-hidden />
      {t('signIn.tryDemo')}
    </Button>
  )
  const problem = error ?? storeError

  return (
    <main id="main-content" tabIndex={-1} className="pt-safe pb-safe relative isolate min-h-full overflow-hidden focus:outline-none">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:ring-2 focus:ring-ring"
      >
        {t('skipToContent')}
      </a>
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse at 8% 0%, rgb(37 99 235 / 13%), transparent 55%), radial-gradient(ellipse at 95% 90%, rgb(16 185 129 / 9%), transparent 50%)',
        }}
      />
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-5">
        <header className="flex items-center justify-between gap-4 py-6">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Ekagra home">
            <img src="/favicon.svg" alt="" className="size-9" />
            <span className="font-heading text-xl font-semibold tracking-tight">{t('appName')}</span>
          </Link>
          <nav aria-label="Public links" className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link to="/pricing" className="underline-offset-4 hover:text-foreground hover:underline">
              {t('pricing')}
            </Link>
            <Link to="/privacy" className="underline-offset-4 hover:text-foreground hover:underline">
              {t('privacy')}
            </Link>
            <Link to="/terms" className="underline-offset-4 hover:text-foreground hover:underline">
              {t('terms')}
            </Link>
          </nav>
        </header>

        <div className="grid flex-1 items-center gap-12 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:py-16">
          <section>
            <p className="inline-flex items-center gap-2 rounded-full bg-mode-study/10 px-3 py-1 text-xs font-medium text-mode-study">
              <span className="size-1.5 rounded-full bg-mode-study" aria-hidden />
              {t('signIn.badge')}
            </p>
            <h1 className="mt-5 font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              {t('signIn.heroTitleLine1')}
              <br />
              <span className="text-mode-study">{t('signIn.heroTitleHighlight')}</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              {t('signIn.heroSubtitle')}
            </p>
            <ul className="mt-9 grid max-w-xl gap-x-8 gap-y-5 sm:grid-cols-2">
              {FEATURE_KEYS.map(({ icon: Icon, key }) => (
                <li key={key} className="flex gap-3">
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-mode-study/10 text-mode-study">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{t(`signIn.features.${key}.title`)}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{t(`signIn.features.${key}.text`)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <Card className="w-full max-w-md justify-self-center border-foreground/10 shadow-xl shadow-mode-study/10 lg:justify-self-end">
            <CardHeader>
              <CardTitle className="font-heading text-2xl">{t('signIn.cardTitle')}</CardTitle>
              <CardDescription>{t('signIn.cardDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {notice && (
                <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm">
                  {notice}
                </p>
              )}
              {statusMessage && (
                <p role="status" className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                  {statusMessage}
                </p>
              )}
              {/* Without Supabase, Demo Mode is the main button. */}
              {isSupabaseConfigured ? [googleButton, demoButton] : [demoButton, googleButton]}

              <div className="relative my-1 flex items-center">
                <span className="w-full border-t border-border/70" />
                <span className="shrink-0 bg-card px-2 text-xs text-muted-foreground">{t('signIn.orUseEmail')}</span>
                <span className="w-full border-t border-border/70" />
              </div>

              <form onSubmit={(e) => void submitEmailAuth(e)} className="grid gap-2.5" noValidate>
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Email authentication mode">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={emailMode === 'signIn'}
                    onClick={() => {
                      setEmailMode('signIn')
                      setError(null)
                    }}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                      emailMode === 'signIn' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t('signIn.emailSignInTab')}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={emailMode === 'signUp'}
                    onClick={() => {
                      setEmailMode('signUp')
                      setError(null)
                    }}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                      emailMode === 'signUp' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t('signIn.emailSignUpTab')}
                  </button>
                </div>

                <div className="grid gap-1">
                  <Label htmlFor="signin-email" className="text-xs font-medium">
                    {t('signIn.emailLabel')}
                  </Label>
                  <Input
                    id="signin-email"
                    type="email"
                    autoComplete="email"
                    placeholder={t('signIn.emailPlaceholder')}
                    value={email}
                    disabled={!isSupabaseConfigured || anyBusy}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="grid gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="signin-password" className="text-xs font-medium">
                      {t('signIn.passwordLabel')}
                    </Label>
                    <button
                      type="button"
                      disabled={!isSupabaseConfigured || anyBusy}
                      onClick={() => void handleForgotPassword()}
                      className="text-xs font-medium text-primary underline-offset-3 hover:underline disabled:pointer-events-none disabled:opacity-50"
                    >
                      {resetBusy ? 'Sending…' : t('signIn.forgotPassword')}
                    </button>
                  </div>
                  <Input
                    id="signin-password"
                    type="password"
                    autoComplete={emailMode === 'signIn' ? 'current-password' : 'new-password'}
                    value={password}
                    disabled={!isSupabaseConfigured || anyBusy}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <Button type="submit" variant="secondary" disabled={!isSupabaseConfigured || anyBusy}>
                  {emailBusy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Mail className="size-4" aria-hidden />}
                  {emailMode === 'signIn' ? t('signIn.signInEmailButton') : t('signIn.signUpEmailButton')}
                </Button>
              </form>

              <p className="text-sm text-muted-foreground">
                {isSupabaseConfigured
                  ? t('signIn.demoConfiguredHint')
                  : t('signIn.demoUnconfiguredHint')}
              </p>
              {problem && (
                <p role="alert" className="text-sm text-destructive">
                  {problem}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{t('signIn.freeToStart')}</p>
            </CardContent>
          </Card>
        </div>

        <PublicTollboothPreview />

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 py-6 text-xs text-muted-foreground">
          <p>{t('signIn.footerTagline')}</p>
          <div className="flex flex-wrap items-center gap-4">
            <Link to="/pricing" className="underline underline-offset-3 hover:text-foreground">
              {t('pricing')}
            </Link>
            <Link to="/privacy" className="underline underline-offset-3 hover:text-foreground">
              {t('signIn.privacyLink')}
            </Link>
            <Link to="/terms" className="underline underline-offset-3 hover:text-foreground">
              {t('signIn.termsLink')}
            </Link>
          </div>
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
