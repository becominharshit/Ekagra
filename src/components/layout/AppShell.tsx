import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router'
import { ModeSwitchGuard } from '@/features/mode/ModeSwitchGuard'
import { usePlanKeeper } from '@/features/planner/replan'
import { BottomTabBar } from './BottomTabBar'
import { TopBar } from './TopBar'

/** The frame around every page: top bar, the page itself (scrolls), bottom tabs. */
export function AppShell() {
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  // The plan is made when the app opens with an old one, and again when its inputs change.
  usePlanKeeper()

  // A new page starts at the top, not where the previous page was scrolled to.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <main ref={mainRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 pt-5 pb-8">
          <Outlet />
        </div>
      </main>
      <BottomTabBar />
      <ModeSwitchGuard />
    </div>
  )
}
