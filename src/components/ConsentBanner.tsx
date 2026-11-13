import { useEffect, useState } from 'react'
import { Shield } from 'lucide-react'
import { Link, Outlet } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  ANALYTICS_CONSENT_EVENT,
  getAnalyticsConsent,
  setAnalyticsConsent,
  type AnalyticsConsentState,
} from '@/lib/observability'

/**
 * Non-intrusive consent banner shown only until the visitor explicitly grants
 * or declines optional privacy-respecting product analytics.
 */
export function ConsentBanner() {
  const [consent, setConsent] = useState<AnalyticsConsentState>(() => getAnalyticsConsent())

  useEffect(() => {
    const sync = () => setConsent(getAnalyticsConsent())
    window.addEventListener(ANALYTICS_CONSENT_EVENT, sync)
    return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, sync)
  }, [])

  if (consent !== 'unset') return null

  return (
    <aside
      aria-label="Privacy and analytics preferences"
      className="fixed right-4 bottom-4 left-4 z-40 rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur sm:left-auto sm:max-w-sm"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Shield className="size-4" aria-hidden />
        </span>
        <div className="grid gap-2 text-xs leading-relaxed">
          <p className="font-medium text-foreground">Optional product analytics</p>
          <p className="text-muted-foreground">
            Ekagra never uses ad trackers. With your permission, anonymized usage counts help us improve reliability.{' '}
            <Link to="/privacy" className="text-foreground underline underline-offset-2">
              Privacy Policy
            </Link>
          </p>
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" size="sm" variant="outline" onClick={() => setAnalyticsConsent('denied')}>
              Decline
            </Button>
            <Button type="button" size="sm" onClick={() => setAnalyticsConsent('granted')}>
              Accept analytics
            </Button>
          </div>
        </div>
      </div>
    </aside>
  )
}

/** Root route wrapper mounting global privacy/consent overlays alongside router views. */
export function RootLayout() {
  return (
    <>
      <Outlet />
      <ConsentBanner />
    </>
  )
}
