// Ekagra's service worker, for the installed web app. src/lib/pwa.ts registers it on the web in
// production builds only; the Android app never does. It lets the app open without a connection:
//   - pages: from the network first, else the saved app (index.html; the app finds the page itself)
//   - built files (/assets/…, whose names change with every build): saved the first time, then
//     read from the saved copy
//   - other files of this site (icons, the manifest): from the network first, else the saved copy
// Requests to other sites (Supabase, the AI, Pyodide's CDN) and anything but GET are left alone.
// Each build registers /sw.js?v=<build> with a cache of its own; older caches are deleted when the
// new worker takes over (after the old pages are closed).

const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
const CACHE = `ekagra-${VERSION}`
const APP = '/index.html'
// Hosts often add "Vary: Origin", and the page's scripts send an Origin header that the saved copies
// were made without; these are this site's own files, the same for everyone, so Vary is ignored.
const MATCH = { ignoreVary: true }

self.addEventListener('install', (event) => {
  event.waitUntil(saveApp())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('ekagra-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

/** Saves the app's page and the built files it loads first, so the next start works offline. */
async function saveApp() {
  try {
    const cache = await caches.open(CACHE)
    const response = await fetch('/', { cache: 'no-cache' })
    if (response.status !== 200) return
    const html = await response.clone().text()
    await cache.put(APP, response)
    const files = new Set(html.match(/\/assets\/[^"'\s>)]+/g) || [])
    await Promise.allSettled([...files].map((file) => cache.add(file)))
  } catch {
    // Offline or out of space while installing: the files are saved as the app loads them.
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate') event.respondWith(page(event))
  else if (url.pathname.startsWith('/assets/')) event.respondWith(builtFile(event))
  else event.respondWith(networkFirst(event))
})

/** Keeps a copy of a full (200) answer without making the page wait; a full cache is ignored. */
function keep(event, cache, key, response) {
  if (response.status !== 200) return
  event.waitUntil(cache.put(key, response.clone()).catch(() => undefined))
}

// A server error (5xx) counts as no connection too: a proxy or captive Wi-Fi answers with one
// when the real server can't be reached.
async function page(event) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(event.request)
    if (response.status >= 500) return (await cache.match(APP, MATCH)) || response
    if ((response.headers.get('content-type') || '').includes('text/html')) keep(event, cache, APP, response)
    return response
  } catch {
    return (await cache.match(APP, MATCH)) || Response.error()
  }
}

async function builtFile(event) {
  const cache = await caches.open(CACHE)
  const saved = await cache.match(event.request, MATCH)
  if (saved) return saved
  const response = await fetch(event.request)
  keep(event, cache, event.request, response)
  return response
}

async function networkFirst(event) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(event.request)
    if (response.status >= 500) return (await cache.match(event.request, MATCH)) || response
    keep(event, cache, event.request, response)
    return response
  } catch {
    return (await cache.match(event.request, MATCH)) || Response.error()
  }
}
