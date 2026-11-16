import { describe, expect, it } from 'vitest'
import {
  isThemePreference,
  readThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  toggledThemePreference,
  writeThemePreference,
} from './theme'

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
  }
}

describe('theme preference', () => {
  it('validates allowed theme preferences', () => {
    expect(isThemePreference('light')).toBe(true)
    expect(isThemePreference('dark')).toBe(true)
    expect(isThemePreference('system')).toBe(true)
    expect(isThemePreference('sepia')).toBe(false)
    expect(isThemePreference(null)).toBe(false)
  })

  it('defaults to system when storage is empty or invalid', () => {
    expect(readThemePreference(memoryStorage())).toBe('system')
    expect(readThemePreference(memoryStorage({ [THEME_STORAGE_KEY]: 'invalid' }))).toBe('system')
  })

  it('persists and reads light and dark preferences in localStorage', () => {
    const storage = memoryStorage()
    writeThemePreference('dark', storage)
    expect(readThemePreference(storage)).toBe('dark')
    writeThemePreference('light', storage)
    expect(readThemePreference(storage)).toBe('light')
  })

  it('resolves system preference dynamically and honors explicit light/dark choices', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('toggles cleanly from the currently visible theme', () => {
    expect(toggledThemePreference('system', false)).toBe('dark')
    expect(toggledThemePreference('system', true)).toBe('light')
    expect(toggledThemePreference('dark', false)).toBe('light')
    expect(toggledThemePreference('light', true)).toBe('dark')
  })
})
