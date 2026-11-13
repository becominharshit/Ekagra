import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BLOCKED_DOMAINS,
  buildDnrRules,
  isFocusActive,
  isTemporarilyUnlocked,
  matchesBlockedDomain,
  normalizeDomain,
  parseDomainList,
} from '../../extension/rules.js'

const EXT_DIR = path.resolve(import.meta.dirname, '../../extension')

describe('Ekagra FocusGuard MV3 extension', () => {
  it('ships a valid Manifest V3 configuration referencing only existing files', () => {
    const raw = readFileSync(path.join(EXT_DIR, 'manifest.json'), 'utf8')
    const manifest = JSON.parse(raw) as {
      manifest_version: number
      permissions: string[]
      background?: { service_worker?: string }
      action?: { default_popup?: string }
      options_page?: string
      web_accessible_resources?: { resources: string[] }[]
    }
    expect(manifest.manifest_version).toBe(3)
    expect(manifest.permissions).toEqual(expect.arrayContaining(['declarativeNetRequest', 'storage', 'alarms', 'tabs']))
    expect(existsSync(path.join(EXT_DIR, manifest.background?.service_worker ?? ''))).toBe(true)
    expect(existsSync(path.join(EXT_DIR, manifest.action?.default_popup ?? ''))).toBe(true)
    expect(existsSync(path.join(EXT_DIR, manifest.options_page ?? ''))).toBe(true)
    for (const entry of manifest.web_accessible_resources ?? []) {
      for (const file of entry.resources) {
        expect(existsSync(path.join(EXT_DIR, file)), file).toBe(true)
      }
    }
  })

  it('normalizes and deduplicates domains safely', () => {
    expect(normalizeDomain('https://www.YouTube.com/watch?v=123')).toBe('youtube.com')
    expect(normalizeDomain('M.Reddit.com:443')).toBe('m.reddit.com')
    expect(normalizeDomain('not a domain')).toBeNull()
    expect(normalizeDomain('localhost')).toBeNull()

    expect(parseDomainList('https://www.youtube.com, reddit.com\nyoutube.com\ninvalid')).toEqual(['youtube.com', 'reddit.com'])
    expect(parseDomainList(JSON.stringify({ blockedDomains: ['X.com', 'https://twitch.tv'] }))).toEqual(['x.com', 'twitch.tv'])
  })

  it('builds MV3 declarativeNetRequest redirect rules and matches subdomains', () => {
    const rules = buildDnrRules(DEFAULT_BLOCKED_DOMAINS)
    expect(rules).toHaveLength(DEFAULT_BLOCKED_DOMAINS.length)
    expect(rules[0]).toEqual({
      id: 1,
      priority: 1,
      action: { type: 'redirect', redirect: { extensionPath: '/blocked.html?site=youtube.com' } },
      condition: { urlFilter: '||youtube.com', resourceTypes: ['main_frame'] },
    })

    expect(matchesBlockedDomain('https://music.youtube.com/watch?v=1', DEFAULT_BLOCKED_DOMAINS)).toBe('youtube.com')
    expect(matchesBlockedDomain('https://github.com/becominharshit/Ekagra', DEFAULT_BLOCKED_DOMAINS)).toBeNull()
  })

  it('tracks active focus window vs temporary Tollbooth unlock expiry', () => {
    const now = 1_700_000_000_000
    expect(isFocusActive({ focusActive: true, focusEndsAt: now + 60_000, unlockUntil: null }, now)).toBe(true)
    expect(isFocusActive({ focusActive: true, focusEndsAt: now - 1000, unlockUntil: null }, now)).toBe(false)
    expect(isTemporarilyUnlocked({ unlockUntil: now + 30_000 }, now)).toBe(true)
    expect(isFocusActive({ focusActive: true, focusEndsAt: now + 60_000, unlockUntil: now + 30_000 }, now)).toBe(false)
  })
})
