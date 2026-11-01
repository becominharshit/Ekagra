import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { focusGuardAvailable, type LaunchableApp } from '@/lib/native/focusGuard'
import { blockedPackages, useBlockedApps, useSetAppBlocked } from './blockedApps'
import { useLaunchableApps } from './guard'

/** The app's icon, or its first letter on the web. */
function AppIcon({ app }: { app: LaunchableApp }) {
  if (app.iconBase64) return <img src={`data:image/png;base64,${app.iconBase64}`} alt="" className="size-9 shrink-0 rounded-lg" />
  return <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-medium text-muted-foreground">{app.label.charAt(0)}</div>
}

/** Pick the apps FocusGuard blocks during focus; the ones already picked come first. */
export function BlockedAppsPicker() {
  const apps = useLaunchableApps()
  const blocked = useBlockedApps()
  const toggle = useSetAppBlocked()
  const [search, setSearch] = useState('')
  const active = new Set(blockedPackages(blocked.data ?? []))
  const wanted = search.trim().toLowerCase()
  const list = (apps.data ?? [])
    .filter((app) => app.label.toLowerCase().includes(wanted))
    .sort((a, b) => Number(active.has(b.packageName)) - Number(active.has(a.packageName)))
  // While a change is saving, it already shows.
  const isBlocked = (app: LaunchableApp) => (toggle.isPending && toggle.variables.packageName === app.packageName ? toggle.variables.blocked : active.has(app.packageName))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Apps to block</CardTitle>
        <CardDescription>
          {active.size === 0 ? 'Pick the apps that pull you away while you focus.' : `${active.size} ${active.size === 1 ? 'app is' : 'apps are'} blocked during focus.`}
          {!focusGuardAvailable() && ' These are examples: on your phone, your own apps show here.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Input aria-label="Search apps" placeholder="Search apps" value={search} onChange={(event) => setSearch(event.target.value)} />
        {(apps.isPending || blocked.isPending) && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Loading your apps…
          </p>
        )}
        <ul className="grid max-h-[28rem] gap-1 overflow-y-auto">
          {list.map((app) => (
            <li key={app.packageName}>
              <label htmlFor={`block-${app.packageName}`} className="flex items-center gap-3 rounded-lg px-1 py-1.5 hover:bg-muted/40">
                <AppIcon app={app} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{app.label}</span>
                  {app.alwaysAllowed && <span className="block text-xs text-muted-foreground">Always allowed</span>}
                </span>
                <Checkbox
                  id={`block-${app.packageName}`}
                  aria-label={`Block ${app.label}`}
                  disabled={app.alwaysAllowed}
                  checked={!app.alwaysAllowed && isBlocked(app)}
                  onCheckedChange={(value) => toggle.mutate({ packageName: app.packageName, label: app.label, blocked: value === true })}
                />
              </label>
            </li>
          ))}
        </ul>
        {apps.data && list.length === 0 && <p className="text-sm text-muted-foreground">No app matches “{search}”.</p>}
        {(apps.error ?? blocked.error ?? toggle.error) && (
          <p role="alert" className="text-sm text-destructive">
            {(apps.error ?? blocked.error ?? toggle.error)?.message}
          </p>
        )}
        <p className="text-xs text-muted-foreground">The phone, messages, clock, maps and settings are never blocked.</p>
      </CardContent>
    </Card>
  )
}
