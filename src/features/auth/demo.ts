import type { AppUser } from './authStore'

// Demo Mode: try the app without an account. Everything stays on this device and nothing is
// sent to a server. A flag in the browser's localStorage remembers it between visits.

const DEMO_FLAG = 'sma-demo-mode'

export const DEMO_USER: AppUser = {
  id: 'demo-user',
  email: null,
  name: 'Demo Student',
  avatarUrl: null,
  isDemo: true,
}

export function isDemoModeSaved(): boolean {
  try {
    return localStorage.getItem(DEMO_FLAG) === 'on'
  } catch {
    return false // storage is blocked (or we're in a test)
  }
}

export function saveDemoMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(DEMO_FLAG, 'on')
    else localStorage.removeItem(DEMO_FLAG)
  } catch {
    // Storage is blocked: Demo Mode then lasts until the page is closed.
  }
}
