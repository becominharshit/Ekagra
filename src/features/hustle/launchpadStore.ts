import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ActiveLaunch } from './launchpad'

interface LaunchpadState {
  /** The launch that is running, if any. */
  active: ActiveLaunch | null
  start: (launch: ActiveLaunch) => void
  /** More time for the running launch. */
  extend: (minutes: number) => void
  clear: () => void
}

// Kept in localStorage, so the timer survives leaving the app to use Upwork or Instagram.
export const useLaunchpadStore = create<LaunchpadState>()(
  persist(
    (set) => ({
      active: null,
      start: (launch) => set({ active: launch }),
      extend: (minutes) => set((state) => (state.active ? { active: { ...state.active, minutes: state.active.minutes + minutes } } : state)),
      clear: () => set({ active: null }),
    }),
    { name: 'ekagra-launchpad', partialize: (state) => ({ active: state.active }) },
  ),
)
