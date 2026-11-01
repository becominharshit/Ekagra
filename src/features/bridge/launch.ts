import { BRIDGE_PARAM, launchRoute } from './protocol'

// Imported first by main.tsx, before the router is made: when Ekagra Studio opened this app with an
// anchor (?bridge_payload=…), the address becomes that anchor's page, so the router starts there.
// A broken payload is just taken out of the address.

const route = launchRoute(window.location.href)
if (route !== null) {
  const url = new URL(window.location.href)
  url.searchParams.delete(BRIDGE_PARAM)
  window.history.replaceState(null, '', route || `${url.pathname}${url.search}${url.hash}`)
}
