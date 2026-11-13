import { Inbox, Library, Sparkles } from 'lucide-react'
import { Link, Outlet } from 'react-router'
import { Button } from '@/components/ui/button'
import { useSubjects } from '@/features/academics/subjects'
import { cn } from '@/lib/utils'
import { StudioBaseProvider, StudioNavLink } from '@studio/lib/studioPath'

const pillClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-muted',
    isActive && 'border-studio/40 bg-studio/10 text-studio',
  )

/** Studio mounted inside Ekagra's main AppShell at `/studio/*` so users share one session and navigation frame. */
export function EmbeddedStudioShell() {
  const subjects = useSubjects()

  return (
    <StudioBaseProvider base="/studio">
      <div className="mb-6 grid gap-3 border-b pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-studio/15 text-studio">
              <Sparkles className="size-4" aria-hidden />
            </span>
            <div>
              <p className="font-heading text-sm font-semibold leading-none">Ekagra Studio</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Materials, AI notes, mind maps &amp; revision sheets</p>
            </div>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/academics/library">All Library items</Link>
          </Button>
        </div>

        <nav aria-label="Studio sections" className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <StudioNavLink to="/" end className={pillClass}>
            <Library className="size-3.5" aria-hidden />
            <span>Library</span>
          </StudioNavLink>
          {(subjects.data ?? []).map((subject) => (
            <StudioNavLink key={subject.id} to={`/subjects/${subject.id}`} className={pillClass}>
              <span className="max-w-36 truncate">{subject.name}</span>
            </StudioNavLink>
          ))}
          <StudioNavLink to="/unfiled" className={pillClass}>
            <Inbox className="size-3.5" aria-hidden />
            <span>No subject</span>
          </StudioNavLink>
        </nav>
      </div>

      <Outlet />
    </StudioBaseProvider>
  )
}
