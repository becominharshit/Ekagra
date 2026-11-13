import { useEffect, useState, type FormEvent } from 'react'
import { Check, KeyRound, LoaderCircle } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { completeWebAuthCallback, updateUserPassword } from '@/features/auth/auth'
import { useAuthStore } from '@/features/auth/authStore'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

const MIN_PASSWORD_LENGTH = 6

/** Completes Supabase password recovery (PKCE ?code= or recovery session) and routes straight to /today. */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const status = useAuthStore((state) => state.status)
  const [callbackSettled, setCallbackSettled] = useState(() => !isSupabaseConfigured || status === 'signed_in')
  const [recovered, setRecovered] = useState(() => status === 'signed_in')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (status === 'signed_in' || !isSupabaseConfigured) return

    let cancelled = false
    const subscription = supabase?.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        useAuthStore.getState().setSession(session)
        setRecovered(true)
        setCallbackSettled(true)
      }
    })

    void completeWebAuthCallback(params)
      .then((outcome) => {
        if (cancelled) return
        if (outcome.status === 'signed_in') {
          setRecovered(true)
        } else if (outcome.status === 'error') {
          setError(outcome.message)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Your password reset link could not be verified.')
        }
      })
      .finally(() => {
        if (!cancelled) setCallbackSettled(true)
      })

    return () => {
      cancelled = true
      subscription?.data.subscription.unsubscribe()
    }
  }, [params, status])

  const hasRecoverySession = status === 'signed_in' || recovered
  const checking = Boolean(isSupabaseConfigured && !hasRecoverySession && !callbackSettled)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Choose a password that is at least ${MIN_PASSWORD_LENGTH} characters long.`)
      return
    }
    if (password !== confirmPassword) {
      setError('Both password fields must match.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateUserPassword(password)
      setDone(true)
      navigate('/today', { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update your password. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main id="main-content" tabIndex={-1} className="pt-safe pb-safe flex min-h-full items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading text-xl">
            <KeyRound className="size-5 text-primary" aria-hidden />
            Reset your password
          </CardTitle>
          <CardDescription>Choose a new password for your Ekagra account.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {checking ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              Verifying your reset link…
            </p>
          ) : !hasRecoverySession ? (
            <div className="grid gap-3">
              <p role="alert" className="text-sm text-destructive">
                {error ?? 'This password reset link has expired or is invalid. Request a new reset email from sign-in.'}
              </p>
              <Button asChild variant="outline">
                <Link to="/sign-in" replace>
                  Back to sign-in
                </Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-3" noValidate>
              <div className="grid gap-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 6 characters"
                  value={password}
                  disabled={saving || done}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Re-enter your new password"
                  value={confirmPassword}
                  disabled={saving || done}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              {done && (
                <p role="status" className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-300">
                  <Check className="size-4" aria-hidden />
                  Password updated. Taking you to Today…
                </p>
              )}
              <Button type="submit" disabled={saving || done}>
                {saving ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
                Save new password
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
