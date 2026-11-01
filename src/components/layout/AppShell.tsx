import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router'
import { FocusBar } from '@/features/focus/FocusBar'
import { LaunchpadBar } from '@/features/hustle/LaunchpadBar'
import { ModeSwitchGuard } from '@/features/mode/ModeSwitchGuard'
import { usePlanKeeper } from '@/features/planner/replan'
import { CaptureButton } from '@/features/tasks/CaptureButton'
import { CaptureSheet } from '@/features/tasks/CaptureSheet'
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
      {/* A running Launchpad session (10 minutes on Upwork, Instagram…) stays in view on every screen. */}
      <LaunchpadBar />
      {/* So does a running focus session (Today and the focus screen show it themselves). */}
      <FocusBar />
      <main ref={mainRef} className="flex-1 overflow-y-auto">
        {/* Extra space at the bottom so the floating + button never covers the last item. */}
        <div className="mx-auto w-full max-w-2xl px-4 pt-5 pb-24">
          <Outlet />
        </div>
      </main>
      <BottomTabBar />
      <CaptureButton />
      <CaptureSheet />
      <ModeSwitchGuard />
    </div>
  )
}
