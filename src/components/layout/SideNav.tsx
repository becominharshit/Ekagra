import { NavLink } from 'react-router'
import { cn } from '@/lib/utils'
import { TABS } from './tabs'

/** The main menu on wide screens (laptops and desktops), in place of the bottom tabs. */
export function SideNav() {
  return (
    <nav aria-label="Main" className="hidden w-56 shrink-0 overflow-y-auto border-r bg-background lg:block">
      <ul className="grid gap-1 p-3">
        {TABS.map(({ to, label, icon: Icon, activeClass }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  isActive && ['bg-muted', activeClass],
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="size-[18px]" strokeWidth={isActive ? 2.4 : 1.8} aria-hidden />
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
