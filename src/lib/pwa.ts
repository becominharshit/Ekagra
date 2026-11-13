import { Capacitor } from '@capacitor/core'
import { PYODIDE_INDEX_URL, PYODIDE_VERSION } from '@/features/coding/python'

// The installable web app: public/manifest.webmanifest names it and gives its icons, and the
// service worker (public/sw.js) lets it open without a connection. The worker runs only on the web
// and only in production builds: the Android app carries its own files, and during development a
// saved copy would hide every change.

export const PYODIDE_CACHE_NAME = `ekagra-pyodide-v${PYODIDE_VERSION}`

export const PYODIDE_CORE_ASSETS = [
  `${PYODIDE_INDEX_URL}pyodide.mjs`,
  `${PYODIDE_INDEX_URL}pyodide.asm.js`,
  `${PYODIDE_INDEX_URL}pyodide.asm.wasm`,
  `${PYODIDE_INDEX_URL}python_stdlib.zip`,
  `${PYODIDE_INDEX_URL}pyodide-lock.json`,
] as const

export type PyodideOfflineStatus = 'ready' | 'not-cached' | 'unsupported'

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || Capacitor.isNativePlatform() || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    // A new build registers a new address (?v=<build>), so the browser installs the new worker.
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(__APP_BUILD__)}`).catch(() => {
      // No service worker (a private window, for example): the app works the same, just not offline.
    })
  })
}

/** Checks whether the core Pyodide WebAssembly & stdlib assets are cached on this device. */
export async function checkPyodideOfflineReady(): Promise<PyodideOfflineStatus> {
  if (typeof caches === 'undefined') return 'unsupported'
  try {
    const cache = await caches.open(PYODIDE_CACHE_NAME)
    const checks = await Promise.all([
      cache.match(`${PYODIDE_INDEX_URL}pyodide.mjs`, { ignoreVary: true }),
      cache.match(`${PYODIDE_INDEX_URL}pyodide.asm.wasm`, { ignoreVary: true }),
      cache.match(`${PYODIDE_INDEX_URL}python_stdlib.zip`, { ignoreVary: true }),
    ])
    return checks.every(Boolean) ? 'ready' : 'not-cached'
  } catch {
    return 'unsupported'
  }
}

/**
 * Downloads and persists the core Pyodide runtime (~13 MB) into Cache Storage so Python runs
 * without internet access. Also notifies the active service worker if registered.
 */
export async function preparePyodideOffline(
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ ok: boolean; error?: string }> {
  if (typeof caches === 'undefined') {
    return { ok: false, error: 'Offline Cache Storage is unavailable in this browser context.' }
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, error: 'You are currently offline. Connect to download Python (~13 MB) once.' }
  }
  try {
    const cache = await caches.open(PYODIDE_CACHE_NAME)
    const total = PYODIDE_CORE_ASSETS.length
    let loaded = 0

    for (const url of PYODIDE_CORE_ASSETS) {
      const cached = await cache.match(url, { ignoreVary: true })
      if (!cached) {
        const res = await fetch(url, { mode: 'cors' })
        if (!res.ok) {
          return { ok: false, error: `Could not cache Python runtime asset (${res.status}). Check your connection and try again.` }
        }
        await cache.put(url, res)
      }
      loaded += 1
      onProgress?.(loaded, total)
    }

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'PRECACHE_PYODIDE',
        urls: [...PYODIDE_CORE_ASSETS],
      })
    }
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to download Python offline runtime.',
    }
  }
}
