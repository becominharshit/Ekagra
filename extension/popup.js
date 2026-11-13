/* global chrome */
const statusEl = document.getElementById('status')
const controlsEl = document.getElementById('controls')
const optionsLink = document.getElementById('options-link')

function render(state) {
  if (!statusEl || !controlsEl) return
  controlsEl.innerHTML = ''
  const now = Date.now()
  if (state.focusActive && state.focusEndsAt && state.focusEndsAt > now) {
    const mins = Math.max(1, Math.ceil((state.focusEndsAt - now) / 60_000))
    statusEl.textContent = `Blocking ${state.blockedDomains.length} sites · ${mins} min left`
    const stopBtn = document.createElement('button')
    stopBtn.textContent = 'End focus block'
    stopBtn.addEventListener('click', async () => {
      const res = await chrome.runtime.sendMessage({ type: 'STOP_FOCUS' })
      if (res?.state) render(res.state)
    })
    controlsEl.appendChild(stopBtn)
    return
  }

  statusEl.textContent = `Ready · ${state.blockedDomains.length} distracting sites listed`
  for (const minutes of [25, 50]) {
    const btn = document.createElement('button')
    btn.className = minutes === 25 ? 'primary' : ''
    btn.textContent = `Start ${minutes}-minute focus`
    btn.addEventListener('click', async () => {
      const res = await chrome.runtime.sendMessage({ type: 'START_FOCUS', minutes })
      if (res?.state) render(res.state)
    })
    controlsEl.appendChild(btn)
  }
}

optionsLink?.addEventListener('click', (event) => {
  event.preventDefault()
  chrome.runtime.openOptionsPage()
})

async function init() {
  const res = await chrome.runtime.sendMessage({ type: 'GET_STATE' })
  if (res?.state) render(res.state)
}

void init()
