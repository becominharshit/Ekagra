export const DEFAULT_BLOCKED_DOMAINS = [
  'youtube.com',
  'instagram.com',
  'reddit.com',
  'x.com',
  'twitter.com',
  'tiktok.com',
  'netflix.com',
  'twitch.tv',
]

export const DEFAULT_EKAGRA_ORIGIN = 'https://ekagra.app'

/** Normalizes a domain string or URL into a clean lowercase hostname, or null if invalid. */
export function normalizeDomain(raw) {
  if (typeof raw !== 'string') return null
  let value = raw.trim().toLowerCase()
  if (!value) return null

  value = value.replace(/^[a-z]+:\/\//, '')
  value = value.split('/')[0] ?? ''
  value = value.split('?')[0] ?? ''
  value = value.split('#')[0] ?? ''
  value = value.split(':')[0] ?? ''
  value = value.replace(/^www\./, '').replace(/\.+$/, '')

  if (!value || value.length > 253) return null
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(value)) {
    return null
  }
  return value
}

/** Parses newline/comma/space text or JSON ({ blockedDomains }) into a deduplicated domain array. */
export function parseDomainList(input) {
  if (Array.isArray(input)) {
    return [...new Set(input.map(normalizeDomain).filter(Boolean))]
  }
  if (typeof input !== 'string') return []
  const trimmed = input.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      const list = Array.isArray(parsed) ? parsed : parsed?.blockedDomains
      if (Array.isArray(list)) {
        return [...new Set(list.map(normalizeDomain).filter(Boolean))]
      }
    } catch {
      // Fall through to delimiter parsing if malformed JSON.
    }
  }
  return [...new Set(trimmed.split(/[\s,;]+/).map(normalizeDomain).filter(Boolean))]
}

/** Checks whether the normalized URL's hostname matches or is a subdomain of any blocked domain. */
export function matchesBlockedDomain(urlString, domains) {
  if (typeof urlString !== 'string' || !Array.isArray(domains) || domains.length === 0) return null
  let hostname = ''
  try {
    hostname = new URL(urlString).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
  for (const domain of domains) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) return domain
  }
  return null
}

/** Builds Manifest V3 declarativeNetRequest redirect rules for active focus blocking. */
export function buildDnrRules(domains, redirectBase = '/blocked.html') {
  const clean = parseDomainList(domains)
  return clean.map((domain, idx) => ({
    id: idx + 1,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: {
        extensionPath: `${redirectBase}?site=${encodeURIComponent(domain)}`,
      },
    },
    condition: {
      urlFilter: `||${domain}`,
      resourceTypes: ['main_frame'],
    },
  }))
}

export function isTemporarilyUnlocked(state, nowMs = Date.now()) {
  return Boolean(state?.unlockUntil && state.unlockUntil > nowMs)
}

export function isFocusActive(state, nowMs = Date.now()) {
  if (!state?.focusActive) return false
  if (state.focusEndsAt && state.focusEndsAt <= nowMs) return false
  return !isTemporarilyUnlocked(state, nowMs)
}
