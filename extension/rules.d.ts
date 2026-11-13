export const DEFAULT_BLOCKED_DOMAINS: string[]
export const DEFAULT_EKAGRA_ORIGIN: string

export interface DnrRule {
  id: number
  priority: number
  action: {
    type: 'redirect'
    redirect: {
      extensionPath: string
    }
  }
  condition: {
    urlFilter: string
    resourceTypes: string[]
  }
}

export interface FocusGuardState {
  focusActive?: boolean
  focusEndsAt?: number | null
  unlockUntil?: number | null
  blockedDomains?: string[]
  ekagraOrigin?: string
}

export function normalizeDomain(raw: unknown): string | null
export function parseDomainList(input: unknown): string[]
export function matchesBlockedDomain(urlString: unknown, domains: string[]): string | null
export function buildDnrRules(domains: string[] | string, redirectBase?: string): DnrRule[]
export function isTemporarilyUnlocked(state: FocusGuardState | null | undefined, nowMs?: number): boolean
export function isFocusActive(state: FocusGuardState | null | undefined, nowMs?: number): boolean
