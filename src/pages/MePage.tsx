import { useState } from 'react'
import { LogOut, UserRound } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { signOut } from '@/features/auth/auth'
import { useAuthStore } from '@/features/auth/authStore'
import { ModeSimulator } from '@/features/mode/ModeSimulator'

const COMING = [
  { title: 'Profile, routine and time budget (55 / 25 / 20)', when: 'M2' },
  { title: 'FocusGuard setup and blocked apps', when: 'M9' },
]

export function MePage() {
  return (
    <>
      <PageHeader title="Me" subtitle="Your profile and settings." />
      <div className="grid gap-4">
        <AccountCard />
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
