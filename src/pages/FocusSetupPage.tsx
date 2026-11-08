import { useEffect, useState } from 'react'
import { ArrowLeft, Play, ShieldAlert, Square } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { blockedPackages, useBlockedApps } from '@/features/focus/blockedApps'
import { BlockedAppsPicker } from '@/features/focus/BlockedAppsPicker'
import { FocusSettingsCard } from '@/features/focus/FocusSettingsCard'
import { readyToBlock, usePermissionStatus } from '@/features/focus/guard'
import { liveTestPlan } from '@/features/focus/guardPlan'
import { PermissionChecklist } from '@/features/focus/PermissionChecklist'
import { focusGuard, focusGuardAvailable } from '@/lib/native/focusGuard'

/** Focus and app blocking (/me/focus): FocusGuard's permissions, the apps to block, a 60-second live test, and the focus settings. */
export function FocusSetupPage() {
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link to="/me">
          <ArrowLeft aria-hidden />
          Me
        </Link>
      </Button>
      <PageHeader title="Focus and app blocking" subtitle="FocusGuard blocks the apps you pick while you focus." />
      <div className="grid gap-4">
        <PermissionChecklist />
        <BlockedAppsPicker />
        <LiveBlockerTestCard />
        <FocusSettingsCard />
      </div>
    </>
  )
}

function LiveBlockerTestCard() {
  const apps = useBlockedApps()
  const status = usePermissionStatus()
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const native = focusGuardAvailable()
  const picked = blockedPackages(apps.data ?? [])
  const permissionsReady = !native || (status.data !== undefined && readyToBlock(status.data))

  useEffect(() => {
    if (endsAt === null) return
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      setSecondsLeft(remaining)
      if (remaining <= 0) setEndsAt(null)
    }
    tick()
    const timer = window.setInterval(tick, 500)
    return () => window.clearInterval(timer)
  }, [endsAt])

  async function startTest() {
    const plan = liveTestPlan(picked, new Date(), 60)
    if (!plan) return
    await focusGuard.start(plan)
    setEndsAt(plan.endsAt)
  }

  async function stopTest() {
    await focusGuard.stop()
    setEndsAt(null)
    setSecondsLeft(0)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="size-5" aria-hidden />
          60-second live blocker test
        </CardTitle>
        <CardDescription>
          {native
            ? 'Start a 60-second test, then switch to one of your blocked apps to see the "Back to study" screen right away.'
            : 'Preview the 60-second blocker test here. In the Android app, this turns FocusGuard on for 1 minute so you can verify your setup.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {picked.length === 0 ? (
          <p className="text-sm text-muted-foreground">Pick at least one app to block above before running the 60-second test.</p>
        ) : !permissionsReady ? (
          <p className="text-sm text-muted-foreground">Turn on Usage access and Display over other apps above to run the live test.</p>
        ) : endsAt !== null && secondsLeft > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
            <p className="text-sm font-medium tabular-nums">
              Blocking {picked.length} {picked.length === 1 ? 'app' : 'apps'} · {secondsLeft}s left — open a blocked app now to test
            </p>
            <Button size="sm" variant="outline" onClick={() => void stopTest()}>
              <Square aria-hidden />
              Stop test
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={() => void startTest()}>
              <Play aria-hidden />
              Test blocking for 60 seconds
            </Button>
            <span className="text-xs text-muted-foreground">
              {picked.length} {picked.length === 1 ? 'app' : 'apps'} selected
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
