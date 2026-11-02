// Links from Ekagra Studio: back to Ekagra (App #1), and back to the page a student opened before
// signing in. Pure functions apart from the small sessionStorage wrappers.

/** VITE_EKAGRA_URL (docs/4-setup-guide.md): where Ekagra runs on the web. Without it, Ekagra's development address. */
const CONFIGURED_EKAGRA_URL: string | undefined = import.meta.env.VITE_EKAGRA_URL
export const DEFAULT_EKAGRA_URL = 'http://localhost:5173'

/** `configured` when it's a web address, else `fallback`. */
export function webBase(configured: string | undefined, fallback: string): string {
  if (!configured) return fallback
  try {
    const url = new URL(configured)
    return url.protocol === 'http:' || url.protocol === 'https:' ? configured : fallback
  } catch {
    return fallback
  }
}

/** A page of a web app at `base` (which may have a path), e.g. pageUrl('https://example.com/ekagra', 'privacy'). */
export function pageUrl(base: string, page: string): string {
  const url = new URL(base)
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${page.replace(/^\/+/, '')}`
  return url.toString()
}

/** A page of Ekagra, e.g. ekagraUrl('academics'). */
export function ekagraUrl(page = ''): string {
  return pageUrl(webBase(CONFIGURED_EKAGRA_URL, DEFAULT_EKAGRA_URL), page)
}

/** A page of Studio to go to: only a path of this app, never another site. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/'
}

const NEXT_KEY = 'ekagra-studio-next'

/** Remembers the page to open after Google sign-in (the page reloads on the way). */
export function rememberNext(next: string | null): void {
  try {
    sessionStorage.setItem(NEXT_KEY, safeNext(next))
  } catch {
    // Storage is blocked: Studio opens its library after sign-in instead.
  }
}

/** The page saved before sign-in. Every sign-in saves one first, so it's never left over from an earlier one. */
export function readNext(): string {
  try {
    return safeNext(sessionStorage.getItem(NEXT_KEY))
  } catch {
    return '/'
  }
}
