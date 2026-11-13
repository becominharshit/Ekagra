import { NavLink } from 'react-router'
import { cn } from '@/lib/utils'
import { TABS } from './tabs'

/** The main menu on phones (< 768px); tablets and wider screens get the side rail/menu instead. */
export function BottomTabBar() {
  return (
    <nav aria-label="Main" className="pb-safe border-t bg-background md:hidden">
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
