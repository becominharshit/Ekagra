import { CircleUser, GraduationCap, HeartPulse, Rocket, Sun, type LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router'
import { cn } from '@/lib/utils'

interface Tab {
  to: string
  label: string
  icon: LucideIcon
  /** Colour of the tab when it's open (matches its mode colour). */
  activeClass: string
}

const TABS: Tab[] = [
  { to: '/today', label: 'Today', icon: Sun, activeClass: 'text-foreground' },
  { to: '/academics', label: 'Academics', icon: GraduationCap, activeClass: 'text-mode-study' },
  { to: '/hustle', label: 'Hustle', icon: Rocket, activeClass: 'text-mode-hustle' },
  { to: '/life', label: 'Life', icon: HeartPulse, activeClass: 'text-mode-life' },
  { to: '/me', label: 'Me', icon: CircleUser, activeClass: 'text-foreground' },
]

export function BottomTabBar() {
  return (
    <nav aria-label="Main" className="pb-safe border-t bg-background">
      <ul className="mx-auto grid h-16 w-full max-w-2xl grid-cols-5">
        {TABS.map(({ to, label, icon: Icon, activeClass }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground',
                  isActive && activeClass,
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="size-5" strokeWidth={isActive ? 2.4 : 1.8} aria-hidden />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
