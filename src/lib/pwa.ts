import { Capacitor } from '@capacitor/core'

// The installable web app: public/manifest.webmanifest names it and gives its icons, and the
// service worker (public/sw.js) lets it open without a connection. The worker runs only on the web
// and only in production builds: the Android app carries its own files, and during development a
// saved copy would hide every change.

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || Capacitor.isNativePlatform() || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    // A new build registers a new address (?v=<build>), so the browser installs the new worker.
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(__APP_BUILD__)}`).catch(() => {
      // No service worker (a private window, for example): the app works the same, just not offline.
    })
  })
}
