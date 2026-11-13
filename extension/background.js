/* global chrome */
import {
  DEFAULT_BLOCKED_DOMAINS,
  DEFAULT_EKAGRA_ORIGIN,
  buildDnrRules,
  isFocusActive,
  matchesBlockedDomain,
  parseDomainList,
} from './rules.js'

const STORAGE_KEYS = ['focusActive', 'focusEndsAt', 'unlockUntil', 'blockedDomains', 'ekagraOrigin']
const ALARM_FOCUS_END = 'ekagra-focus-end'
const ALARM_UNLOCK_END = 'ekagra-unlock-end'

async function readState() {
  const raw = await chrome.storage.local.get(STORAGE_KEYS)
  const blockedDomains = Array.isArray(raw.blockedDomains)
    ? parseDomainList(raw.blockedDomains)
    : [...DEFAULT_BLOCKED_DOMAINS]
  return {
    focusActive: Boolean(raw.focusActive),
    focusEndsAt: typeof raw.focusEndsAt === 'number' ? raw.focusEndsAt : null,
    unlockUntil: typeof raw.unlockUntil === 'number' ? raw.unlockUntil : null,
    blockedDomains,
    ekagraOrigin: typeof raw.ekagraOrigin === 'string' && raw.ekagraOrigin.startsWith('http')
      ? raw.ekagraOrigin.replace(/\/+$/, '')
      : DEFAULT_EKAGRA_ORIGIN,
  }
}

async function sweepOpenBlockedTabs(state) {
  if (!isFocusActive(state)) return
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] })
  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue
    const matched = matchesBlockedDomain(tab.url, state.blockedDomains)
    if (matched) {
      const targetUrl = chrome.runtime.getURL(`blocked.html?site=${encodeURIComponent(matched)}`)
      await chrome.tabs.update(tab.id, { url: targetUrl })
    }
  }
}

async function syncBlockingRules() {
  const state = await readState()
  const now = Date.now()
  if (state.focusActive && state.focusEndsAt && state.focusEndsAt <= now) {
    state.focusActive = false
    state.focusEndsAt = null
    await chrome.storage.local.set({ focusActive: false, focusEndsAt: null })
  }
  if (state.unlockUntil && state.unlockUntil <= now) {
    state.unlockUntil = null
    await chrome.storage.local.set({ unlockUntil: null })
  }

  const existing = await chrome.declarativeNetRequest.getDynamicRules()
  const removeRuleIds = existing.map((rule) => rule.id)
  const addRules = isFocusActive(state, now) ? buildDnrRules(state.blockedDomains) : []

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules })

  const badgeText = isFocusActive(state, now) ? 'ON' : state.unlockUntil ? 'OPEN' : ''
  await chrome.action.setBadgeText({ text: badgeText })
  await chrome.action.setBadgeBackgroundColor({
    color: badgeText === 'ON' ? '#0f172a' : '#d97706',
  })

  await sweepOpenBlockedTabs(state)
  return state
}

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(['blockedDomains', 'ekagraOrigin'])
  const defaults = {}
  if (!Array.isArray(existing.blockedDomains)) defaults.blockedDomains = [...DEFAULT_BLOCKED_DOMAINS]
  if (typeof existing.ekagraOrigin !== 'string') defaults.ekagraOrigin = DEFAULT_EKAGRA_ORIGIN
  if (Object.keys(defaults).length > 0) await chrome.storage.local.set(defaults)
  await syncBlockingRules()
})

chrome.runtime.onStartup.addListener(async () => {
  await syncBlockingRules()
})

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_FOCUS_END) {
    await chrome.storage.local.set({ focusActive: false, focusEndsAt: null, unlockUntil: null })
    await syncBlockingRules()
  } else if (alarm.name === ALARM_UNLOCK_END) {
    await chrome.storage.local.set({ unlockUntil: null })
    await syncBlockingRules()
  }
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  ;(async () => {
    if (message?.type === 'GET_STATE') {
      const state = await syncBlockingRules()
      sendResponse({ ok: true, state })
      return
    }
    if (message?.type === 'START_FOCUS') {
      const minutes = Math.max(1, Math.min(240, Number(message.minutes) || 25))
      const focusEndsAt = Date.now() + minutes * 60_000
      await chrome.storage.local.set({ focusActive: true, focusEndsAt, unlockUntil: null })
      await chrome.alarms.clear(ALARM_UNLOCK_END)
      await chrome.alarms.create(ALARM_FOCUS_END, { when: focusEndsAt })
      const state = await syncBlockingRules()
      sendResponse({ ok: true, state })
      return
    }
    if (message?.type === 'STOP_FOCUS') {
      await chrome.alarms.clear(ALARM_FOCUS_END)
      await chrome.alarms.clear(ALARM_UNLOCK_END)
      await chrome.storage.local.set({ focusActive: false, focusEndsAt: null, unlockUntil: null })
      const state = await syncBlockingRules()
      sendResponse({ ok: true, state })
      return
    }
    if (message?.type === 'TEMP_UNLOCK') {
      const minutes = Math.max(1, Math.min(15, Number(message.minutes) || 3))
      const unlockUntil = Date.now() + minutes * 60_000
      await chrome.storage.local.set({ unlockUntil })
      await chrome.alarms.create(ALARM_UNLOCK_END, { when: unlockUntil })
      const state = await syncBlockingRules()
      sendResponse({ ok: true, state })
      return
    }
    if (message?.type === 'SET_DOMAINS') {
      const cleaned = parseDomainList(message.domains)
      await chrome.storage.local.set({ blockedDomains: cleaned })
      const state = await syncBlockingRules()
      sendResponse({ ok: true, state })
      return
    }
    if (message?.type === 'SET_EKAGRA_ORIGIN') {
      const origin = String(message.origin ?? DEFAULT_EKAGRA_ORIGIN).trim().replace(/\/+$/, '')
      const safe = /^https?:\/\/.+/.test(origin) ? origin : DEFAULT_EKAGRA_ORIGIN
      await chrome.storage.local.set({ ekagraOrigin: safe })
      const state = await syncBlockingRules()
      sendResponse({ ok: true, state })
      return
    }
    sendResponse({ ok: false, error: 'Unknown message type' })
  })()
  return true
})
