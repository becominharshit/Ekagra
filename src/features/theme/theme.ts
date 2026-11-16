export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'ekagra-theme'
export const LIGHT_THEME_COLOR = '#ffffff'
export const DARK_THEME_COLOR = '#171717'

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function readThemePreference(storage: Pick<Storage, 'getItem'> | null | undefined = safeLocalStorage()): ThemePreference {
  try {
    const raw = storage?.getItem(THEME_STORAGE_KEY)
    return isThemePreference(raw) ? raw : 'system'
  } catch {
    return 'system'
  }
}

export function writeThemePreference(preference: ThemePreference, storage: Pick<Storage, 'setItem'> | null | undefined = safeLocalStorage()): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Ignore storage errors (private browsing / restricted iframes).
  }
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'dark') return 'dark'
  if (preference === 'light') return 'light'
  return systemPrefersDark ? 'dark' : 'light'
}

/** Toggles between light and dark based on what is currently displayed. */
export function toggledThemePreference(current: ThemePreference, systemPrefersDark: boolean): 'light' | 'dark' {
  return resolveTheme(current, systemPrefersDark) === 'dark' ? 'light' : 'dark'
}

export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function applyThemeToDocument(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolved === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR)
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}
