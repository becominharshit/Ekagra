import { useEffect, useRef } from 'react'
import { ArrowUpRight, Inbox, Library, LogOut } from 'lucide-react'
import { Outlet, useLocation } from 'react-router'
import { StudioLink as Link, StudioNavLink as NavLink } from '@studio/lib/studioPath'
import { Button } from '@/components/ui/button'
import { useSubjects } from '@/features/academics/subjects'
import { signOut } from '@/features/auth/auth'
import { useAuthStore } from '@/features/auth/authStore'
import { cn } from '@/lib/utils'
import { ekagraUrl } from '@studio/lib/links'

/** Studio's frame: a top bar, and on wide screens a side menu with the library and each subject. */
export function StudioShell() {
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const user = useAuthStore((state) => state.user)

  // A new page starts at the top.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="flex h-full flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <header className="pt-safe border-b bg-background">
        <div className="flex h-14 items-center justify-between gap-3 px-4 lg:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <img src="/favicon.svg" alt="" className="size-6 shrink-0" />
            <span className="truncate font-heading text-base font-semibold tracking-tight">Ekagra Studio</span>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <a href={ekagraUrl()} target="ekagra" rel="noopener" title="Open Ekagra: your plan, tasks and progress">
                <ArrowUpRight aria-hidden />
                Ekagra
              </a>
            </Button>
            <Button variant="ghost" size="icon" aria-label={`Sign out${user?.email ? ` (${user.email})` : ''}`} title="Sign out" onClick={() => void signOut()}>
              <LogOut aria-hidden />
            </Button>
          </div>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <StudioNav />
        <main id="main-content" tabIndex={-1} ref={mainRef} className="min-w-0 flex-1 overflow-y-auto focus:outline-none">
          <div className="mx-auto w-full max-w-5xl px-4 pt-5 pb-16 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

const navItem = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
    isActive && 'bg-studio/10 text-studio hover:bg-studio/15 hover:text-studio',
  )

/** The side menu on wide screens (phones get the same links on the library page). */
function StudioNav() {
  const subjects = useSubjects()
  return (
    <nav aria-label="Library" className="hidden w-60 shrink-0 overflow-y-auto border-r bg-background p-3 lg:block">
      <NavLink to="/" end className={navItem}>
        <Library className="size-4" aria-hidden />
        Library
      </NavLink>
      <p className="mt-5 mb-1 px-3 text-xs font-medium text-muted-foreground">Subjects</p>
      <ul className="grid gap-0.5">
        {(subjects.data ?? []).map((subject) => (
          <li key={subject.id}>
            <NavLink to={`/subjects/${subject.id}`} className={navItem}>
              <span className="truncate">{subject.name}</span>
            </NavLink>
          </li>
        ))}
        <li>
          <NavLink to="/unfiled" className={navItem}>
            <Inbox className="size-4" aria-hidden />
            No subject
          </NavLink>
        </li>
      </ul>
      {subjects.data?.length === 0 && (
        <p className="mt-2 px-3 text-xs text-muted-foreground">
          Your subjects come from Ekagra.{' '}
          <a href={ekagraUrl('academics')} target="ekagra" rel="noopener" className="underline underline-offset-3 hover:text-foreground">
            Add them there
          </a>
          .
        </p>
      )}
    </nav>
  )
}
