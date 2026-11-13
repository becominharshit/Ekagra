// Ekagra's service worker, for the installed web app. src/lib/pwa.ts registers it on the web in
// production builds only; the Android app never does. It lets the app open without a connection:
//   - pages: from the network first, else the saved app (index.html; the app finds the page itself)
//   - built files (/assets/…, whose names change with every build): saved the first time, then
//     read from the saved copy
//   - Pyodide Python runtime (cdn.jsdelivr.net/pyodide/v314.0.7/): cache-first in a dedicated
//     runtime cache that persists across app deploys, or pre-warmed on demand
//   - other files of this site (icons, the manifest): from the network first, else the saved copy
// Each build registers /sw.js?v=<build> with a cache of its own; older app caches are deleted
// when the new worker takes over (after old pages are closed).

const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
const CACHE = `ekagra-${VERSION}`
const PYODIDE_VERSION = '314.0.7'
const PYODIDE_CACHE = `ekagra-pyodide-v${PYODIDE_VERSION}`
const PYODIDE_ORIGIN_PREFIX = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/`
const PYODIDE_CORE_ASSETS = [
  `${PYODIDE_ORIGIN_PREFIX}full/pyodide.mjs`,
  `${PYODIDE_ORIGIN_PREFIX}full/pyodide.asm.js`,
  `${PYODIDE_ORIGIN_PREFIX}full/pyodide.asm.wasm`,
  `${PYODIDE_ORIGIN_PREFIX}full/python_stdlib.zip`,
  `${PYODIDE_ORIGIN_PREFIX}full/pyodide-lock.json`,
]
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
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('ekagra-') && key !== CACHE && key !== PYODIDE_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  const data = event.data
  if (!data || typeof data !== 'object') return
  if (data.type === 'PRECACHE_PYODIDE') {
    const urls = Array.isArray(data.urls) && data.urls.length > 0 ? data.urls : PYODIDE_CORE_ASSETS
    event.waitUntil(precachePyodide(urls))
  }
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

async function precachePyodide(urls) {
  try {
    const cache = await caches.open(PYODIDE_CACHE)
    await Promise.allSettled(
      urls.map(async (assetUrl) => {
        const existing = await cache.match(assetUrl, MATCH)
        if (existing) return
        const res = await fetch(assetUrl, { mode: 'cors' })
        if (res.ok) await cache.put(assetUrl, res)
      }),
    )
  } catch {
    // Gracefully defer to page-level Cache API handler and surface error cleanly in UI
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  if (request.url.startsWith(PYODIDE_ORIGIN_PREFIX)) {
    event.respondWith(pyodideCacheFirst(event))
    return
  }

  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate') event.respondWith(page(event))
  else if (url.pathname.startsWith('/assets/')) event.respondWith(builtFile(event))
  else event.respondWith(networkFirst(event))
})

async function pyodideCacheFirst(event) {
  const cache = await caches.open(PYODIDE_CACHE)
  const saved = await cache.match(event.request, MATCH)
  if (saved) return saved
  try {
    const response = await fetch(event.request)
    if (response.status === 200) {
      event.waitUntil(cache.put(event.request, response.clone()).catch(() => undefined))
    }
    return response
  } catch {
    return Response.error()
  }
}

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
