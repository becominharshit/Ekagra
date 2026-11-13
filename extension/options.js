/* global chrome */
import { DEFAULT_BLOCKED_DOMAINS, parseDomainList } from './rules.js'

const originInput = document.getElementById('origin-input')
const domainsInput = document.getElementById('domains-input')
const saveBtn = document.getElementById('save-btn')
const defaultsBtn = document.getElementById('defaults-btn')
const feedbackEl = document.getElementById('feedback')

function showState(state) {
  if (originInput instanceof HTMLInputElement) originInput.value = state.ekagraOrigin
  if (domainsInput instanceof HTMLTextAreaElement) domainsInput.value = state.blockedDomains.join('\n')
}

async function init() {
  const res = await chrome.runtime.sendMessage({ type: 'GET_STATE' })
  if (res?.state) showState(res.state)
}

saveBtn?.addEventListener('click', async () => {
  const domains = parseDomainList(domainsInput instanceof HTMLTextAreaElement ? domainsInput.value : '')
  const origin = originInput instanceof HTMLInputElement ? originInput.value : ''
  await chrome.runtime.sendMessage({ type: 'SET_EKAGRA_ORIGIN', origin })
  const res = await chrome.runtime.sendMessage({ type: 'SET_DOMAINS', domains })
  if (res?.state) showState(res.state)
  if (feedbackEl) feedbackEl.textContent = `Saved ${domains.length} blocked domains.`
})

defaultsBtn?.addEventListener('click', async () => {
  const res = await chrome.runtime.sendMessage({ type: 'SET_DOMAINS', domains: DEFAULT_BLOCKED_DOMAINS })
  if (res?.state) showState(res.state)
  if (feedbackEl) feedbackEl.textContent = 'Default distracting sites restored.'
})

void init()
