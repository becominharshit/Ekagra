import { useState } from 'react'
import { BatteryCharging, CircleCheck, CircleDashed, LoaderCircle, Settings2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { focusGuard, focusGuardAvailable, type PermissionStatus, type SettingsScreen } from '@/lib/native/focusGuard'
import { cn } from '@/lib/utils'
import { BATTERY_GUIDES, BRANDS, brandOf, type Brand } from './batteryGuide'
import { readyToBlock, usePermissionStatus } from './guard'

type PermissionKey = Exclude<keyof PermissionStatus, 'manufacturer'>

const PERMISSIONS: { key: PermissionKey; screen: SettingsScreen; title: string; why: string; needed: boolean }[] = [
  {
    key: 'usageAccess',
    screen: 'usageAccess',
    title: 'Usage access',
    why: 'Lets Ekagra see which app is open, so it knows when a blocked app starts. It sees app names only, never what you do in them.',
    needed: true,
  },
  { key: 'overlay', screen: 'overlay', title: 'Display over other apps', why: 'Shows the "Back to study" screen on top of a blocked app.', needed: true },
  {
    key: 'notifications',
    screen: 'notifications',
    title: 'Notifications',
    why: 'Android shows a notification while FocusGuard runs ("Focus: 18 min left"), and the Launchpad tells you when your 10 minutes are up.',
    needed: false,
  },
  { key: 'batteryUnrestricted', screen: 'battery', title: 'No battery limits', why: 'Stops the phone from closing FocusGuard in the middle of a session.', needed: false },
  {
    key: 'exactAlarms',
    screen: 'exactAlarms',
    title: 'Alarms and reminders',
    why: "The Launchpad's \"time's up\" reminder arrives exactly when your 10 minutes end, not a few minutes later.",
    needed: false,
  },
]

/** The permissions FocusGuard needs, each in plain words with a button to its settings screen, and the battery guide. */
export function PermissionChecklist() {
  const status = usePermissionStatus()

  if (!focusGuardAvailable()) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" aria-hidden />
            App blocking runs in the Android app
          </CardTitle>
          <CardDescription>
            On your phone, FocusGuard blocks the apps you pick while you focus, with an emergency unlock through the Academic Tollbooth. Install the Android app and open this screen there to turn it
            on. You can already pick the apps below.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const data = status.data
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" aria-hidden />
            {data && readyToBlock(data) ? 'FocusGuard is ready' : 'Set up FocusGuard'}
          </CardTitle>
          <CardDescription>
            {data && readyToBlock(data)
              ? 'Blocked apps are closed during focus. The recommended ones make it more reliable.'
              : 'Turn these on in Android settings. Each button opens the right screen; come back here afterwards.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status.isPending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              Checking…
            </p>
          )}
          <ul className="grid gap-3">
            {data &&
              PERMISSIONS.map((permission) => {
                const on = data[permission.key]
                return (
                  <li key={permission.key} className="flex items-start gap-3">
                    {on ? (
                      <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-label="On" />
                    ) : (
                      <CircleDashed className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-label="Off" />
                    )}
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <p className="text-sm font-medium">
                        {permission.title}
                        {!permission.needed && <span className="font-normal text-muted-foreground"> (recommended)</span>}
                      </p>
                      <p className="text-sm text-muted-foreground">{permission.why}</p>
                    </div>
                    {!on && (
                      <Button size="sm" variant="outline" className="shrink-0" onClick={() => void focusGuard.openPermissionSettings(permission.screen)}>
                        Turn on
                      </Button>
                    )}
                  </li>
                )
              })}
          </ul>
          {status.error && (
            <p role="alert" className="text-sm text-destructive">
              {status.error.message}
            </p>
          )}
        </CardContent>
      </Card>
      <BatteryGuideCard manufacturer={data?.manufacturer ?? ''} />
    </div>
  )
}

/** What to change on this phone (OnePlus, Realme, Xiaomi, Samsung…) so FocusGuard isn't closed in the background. */
function BatteryGuideCard({ manufacturer }: { manufacturer: string }) {
  const detected = brandOf(manufacturer)
  const [brand, setBrand] = useState<Brand | null>(null)
  const shown = brand ?? detected
  const guide = BATTERY_GUIDES[shown]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BatteryCharging className="size-5" aria-hidden />
          Keep FocusGuard running
        </CardTitle>
        <CardDescription>Some phones close apps in the background to save battery. These settings keep blocking on for the whole session.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Phone maker">
          {BRANDS.map((option) => (
            <Button key={option} size="xs" variant={shown === option ? 'default' : 'outline'} aria-pressed={shown === option} onClick={() => setBrand(option)}>
              {BATTERY_GUIDES[option].name}
              {option === detected && option !== 'other' && ' (this phone)'}
            </Button>
          ))}
        </div>
        <ol className="grid list-decimal gap-2 pl-5 text-sm">
          {guide.steps.map((step) => (
            <li key={step} className={cn(step.startsWith('Optional') && 'text-muted-foreground')}>
              {step}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void focusGuard.openPermissionSettings('appInfo')}>
            <Settings2 aria-hidden />
            Open Ekagra's app info
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void focusGuard.openPermissionSettings('battery')}>
            Battery optimisation list
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">More phones and pictures: dontkillmyapp.com</p>
      </CardContent>
    </Card>
  )
}
