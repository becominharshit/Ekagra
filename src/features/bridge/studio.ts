import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import type { Tables } from '@/types/database'
import {
  anchorPayload,
  BRIDGE_CHANNEL,
  encodePayload,
  studioBase,
  studioDeepLink,
  studioPageUrl,
  studioWebUrl,
  type BridgeMessage,
  type BridgePayload,
} from './protocol'

// The Studio Bridge in this app: opening an anchor in Ekagra Studio, and telling Studio tabs (same
// address) about saved and deleted anchors. (A link from Studio is read by launch.ts.)

/** VITE_STUDIO_URL (docs/4-setup-guide.md): where Ekagra Studio runs on the web. Without it, Studio's development address. */
const CONFIGURED_STUDIO_URL: string | undefined = import.meta.env.VITE_STUDIO_URL

export function studioUrl(): string {
  return studioBase(CONFIGURED_STUDIO_URL)
}

// One channel for this tab: a BroadcastChannel doesn't hear its own messages, so the app never
// reacts to what it sent itself.
let channel: BroadcastChannel | null | undefined

export function bridgeChannel(): BroadcastChannel | null {
  if (channel === undefined) channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(BRIDGE_CHANNEL)
  return channel
}

export function postBridge(message: BridgeMessage): void {
  try {
    bridgeChannel()?.postMessage(message)
  } catch {
    // A closed channel: there's nobody to tell.
  }
}

type AnchorRow = Parameters<typeof anchorPayload>[0]

/** Tells Studio tabs an anchor was saved (they show it at once). */
export function announceAnchor(anchor: AnchorRow, materialTitle: string | null): void {
  postBridge({ v: 2, op: 'upsert', source: 'ekagra', payload: anchorPayload(anchor, materialTitle, new Date()) })
}

export function announceAnchorDeleted(anchorId: string): void {
  postBridge({ v: 2, op: 'delete', source: 'ekagra', anchorId })
}

/** How long to wait for Studio's Android app before opening its web version instead. */
const APP_WAIT_MS = 1500

/**
 * Opens an anchor in Ekagra Studio: on Android its app (ekagra-studio://anchor), or its web version
 * when it isn't installed; on the web a Studio tab (VITE_STUDIO_URL, reused for the next anchor).
 * Studio tabs at the same address also hear it on the BroadcastChannel.
 */
export async function openInStudio(anchor: Tables<'ai_anchors'>, materialTitle: string | null): Promise<void> {
  const payload: BridgePayload = anchorPayload(anchor, materialTitle, new Date())
  postBridge({ v: 2, op: 'open', source: 'ekagra', payload })
  const encoded = encodePayload(payload)
  const web = studioWebUrl(studioUrl(), encoded)
  if (Capacitor.isNativePlatform()) {
    window.location.href = studioDeepLink(encoded)
    // Still here after a moment: Studio's app isn't installed, so its web version opens.
    await new Promise((resolve) => window.setTimeout(resolve, APP_WAIT_MS))
    if (document.visibilityState === 'visible') await Browser.open({ url: web })
    return
  }
  window.open(web, 'ekagra-studio')
}

/**
 * Opens a page of Ekagra Studio, e.g. 'notes/<id>' or 'subjects/<id>': on the web in the Studio tab,
 * on Android in the browser (Studio is a web app there).
 */
export async function openStudioPage(page: string): Promise<void> {
  const url = studioPageUrl(studioUrl(), page)
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url })
    return
  }
  window.open(url, 'ekagra-studio')
}
