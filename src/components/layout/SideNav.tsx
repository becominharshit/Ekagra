import { NavLink } from 'react-router'
import { cn } from '@/lib/utils'
import { TABS } from './tabs'

/** Compact icon rail on tablets (md:) and full navigation sidebar on desktops (lg:), replacing the bottom tab bar. */
export function SideNav() {
  return (
    <nav aria-label="Main" className="hidden shrink-0 overflow-y-auto border-r bg-background md:block md:w-16 lg:w-56">
      <ul className="grid gap-1 p-2 lg:p-3">
        {TABS.map(({ to, label, icon: Icon, activeClass }) => (
          <li key={to}>
            <NavLink
              to={to}
              title={label}
              className={({ isActive }) =>
                cn(
                  'flex h-10 items-center justify-center gap-3 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:justify-start lg:px-3',
                  isActive && ['bg-muted', activeClass],
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="size-[18px] shrink-0" strokeWidth={isActive ? 2.4 : 1.8} aria-hidden />
                  <span className="md:sr-only lg:not-sr-only">{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
