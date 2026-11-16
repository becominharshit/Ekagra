import { useEffect } from 'react'
import { create } from 'zustand'
import {
  applyThemeToDocument,
  readThemePreference,
  resolveTheme,
  systemPrefersDark,
  THEME_STORAGE_KEY,
  toggledThemePreference,
  writeThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from '@/features/theme/theme'

interface ThemeState {
  preference: ThemePreference
  resolved: ResolvedTheme
  setTheme: (preference: ThemePreference) => void
  toggleTheme: () => void
  syncFromEnvironment: () => void
}

let initialized = false

const useThemeStore = create<ThemeState>((set, get) => {
  const initialPreference = readThemePreference()
  const initialResolved = resolveTheme(initialPreference, systemPrefersDark())

  return {
    preference: initialPreference,
    resolved: initialResolved,
    setTheme: (preference) => {
      writeThemePreference(preference)
      const resolved = resolveTheme(preference, systemPrefersDark())
      applyThemeToDocument(resolved)
      set({ preference, resolved })
    },
    toggleTheme: () => {
      const next = toggledThemePreference(get().preference, systemPrefersDark())
      get().setTheme(next)
    },
    syncFromEnvironment: () => {
      const preference = readThemePreference()
      const resolved = resolveTheme(preference, systemPrefersDark())
      applyThemeToDocument(resolved)
      set({ preference, resolved })
    },
  }
})

/** Applies the saved (or system) light/dark theme on startup and listens for OS/tab changes. */
export function initTheme(): void {
  const state = useThemeStore.getState()
  applyThemeToDocument(state.resolved)

  if (initialized || typeof window === 'undefined') return
  initialized = true

  const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null
  media?.addEventListener('change', () => {
    const current = useThemeStore.getState().preference
    if (current === 'system') useThemeStore.getState().syncFromEnvironment()
  })

  window.addEventListener('storage', (event) => {
    if (event.key === THEME_STORAGE_KEY) useThemeStore.getState().syncFromEnvironment()
  })
}

/** Reads and updates the user's light/dark/system theme preference persisted in localStorage. */
export function useTheme() {
  const preference = useThemeStore((state) => state.preference)
  const resolved = useThemeStore((state) => state.resolved)
  const setTheme = useThemeStore((state) => state.setTheme)
  const toggleTheme = useThemeStore((state) => state.toggleTheme)

  useEffect(() => {
    initTheme()
  }, [])

  return { preference, resolved, setTheme, toggleTheme }
}
