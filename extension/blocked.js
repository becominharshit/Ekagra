/* global chrome */
const params = new URLSearchParams(window.location.search)
const site = params.get('site')

const siteNameEl = document.getElementById('site-name')
const timerEl = document.getElementById('timer-status')
const backBtn = document.getElementById('back-btn')
const tollboothBtn = document.getElementById('tollbooth-btn')

if (siteNameEl && site) {
  siteNameEl.textContent = site
}

let ekagraOrigin = 'https://ekagra.app'

async function refresh() {
  const res = await chrome.runtime.sendMessage({ type: 'GET_STATE' })
  const state = res?.state
  if (!state) return
  ekagraOrigin = state.ekagraOrigin || ekagraOrigin
  if (timerEl) {
    if (state.focusActive && state.focusEndsAt) {
      const mins = Math.max(1, Math.ceil((state.focusEndsAt - Date.now()) / 60_000))
      timerEl.textContent = `${mins} min left in this focus block.`
    } else {
      timerEl.textContent = 'Focus blocking is active.'
    }
  }
}

backBtn?.addEventListener('click', async () => {
  await chrome.tabs.update({ url: `${ekagraOrigin}/today/focus` })
})

tollboothBtn?.addEventListener('click', async () => {
  const label = encodeURIComponent(site || 'Website')
  const pkg = encodeURIComponent(site ? `web:${site}` : 'web:blocked')
  await chrome.tabs.update({ url: `${ekagraOrigin}/today/focus/tollbooth?app=${pkg}&label=${label}` })
})

void refresh()
