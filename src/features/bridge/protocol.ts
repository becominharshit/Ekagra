import { z } from 'zod'
import type { Tables } from '@/types/database'

// The Studio Bridge between Ekagra (App #1) and Ekagra Studio (App #2): what an AI Anchor looks
// like when it goes from one app to the other, and the three ways it travels:
//   - a link: http://localhost:5174/?bridge_payload=<base64url JSON> (VITE_STUDIO_URL), or
//     ekagra-studio://anchor?bridge_payload=… on Android (and back: ekagra://anchor?bridge_payload=…)
//   - BroadcastChannel('ekagra_app2_studio_bridge_v2') between tabs of the same address (Studio at /studio)
//   - Supabase Realtime on ai_anchors, when both apps are signed in to the same account
// Pure functions, tested on their own. Version 2: a different `v` is ignored.

export const BRIDGE_CHANNEL = 'ekagra_app2_studio_bridge_v2'
export const BRIDGE_PARAM = 'bridge_payload'
export const DEFAULT_STUDIO_URL = 'http://localhost:5174'
export const STUDIO_DEEP_LINK = 'ekagra-studio://anchor'

/** Longer texts are cut when an anchor goes into a link (the receiving app can read the whole one from Supabase by id). */
export const LINK_LIMITS = { selectedText: 1000, question: 500, responseMd: 4000 } as const
/** A link payload longer than this isn't read. */
export const MAX_ENCODED_LENGTH = 16_000

const AnchorPayloadSchema = z.object({
  id: z.string().min(1).max(64),
  materialId: z.string().min(1).max(64),
  materialTitle: z.string().max(200).nullable(),
  pageNo: z.number().int().min(1).max(100_000),
  action: z.string().min(1).max(20),
  selectedText: z.string().max(4000).nullable(),
  question: z.string().max(2000).nullable(),
  responseMd: z.string().max(20_000).nullable(),
  topicId: z.string().max(64).nullable(),
  createdAt: z.string().max(40),
})

export const BridgePayloadSchema = z.object({
  v: z.literal(2),
  kind: z.literal('anchor'),
  source: z.enum(['ekagra', 'ekagra-studio']),
  sentAt: z.string().max(40),
  /** Some texts were cut to fit a link. */
  truncated: z.boolean(),
  anchor: AnchorPayloadSchema,
})
export type BridgePayload = z.infer<typeof BridgePayloadSchema>
export type BridgeSource = BridgePayload['source']

/** A message on the BroadcastChannel: an anchor saved, deleted, or to be opened. */
export const BridgeMessageSchema = z.discriminatedUnion('op', [
  z.object({ v: z.literal(2), op: z.literal('upsert'), source: z.enum(['ekagra', 'ekagra-studio']), payload: BridgePayloadSchema }),
  z.object({ v: z.literal(2), op: z.literal('open'), source: z.enum(['ekagra', 'ekagra-studio']), payload: BridgePayloadSchema }),
  z.object({ v: z.literal(2), op: z.literal('delete'), source: z.enum(['ekagra', 'ekagra-studio']), anchorId: z.string().min(1).max(64) }),
])
export type BridgeMessage = z.infer<typeof BridgeMessageSchema>

export function readMessage(data: unknown): BridgeMessage | null {
  const parsed = BridgeMessageSchema.safeParse(data)
  return parsed.success ? parsed.data : null
}

function cut(text: string | null, limit: number): { text: string | null; cut: boolean } {
  if (text === null || text.length <= limit) return { text, cut: false }
  return { text: `${text.slice(0, limit - 1)}…`, cut: true }
}

/** An anchor as it travels (texts cut to fit a link). */
export function anchorPayload(
  anchor: Pick<Tables<'ai_anchors'>, 'id' | 'material_id' | 'page_no' | 'action' | 'selected_text' | 'question' | 'response_md' | 'topic_id' | 'created_at'>,
  materialTitle: string | null,
  now: Date,
): BridgePayload {
  const selected = cut(anchor.selected_text, LINK_LIMITS.selectedText)
  const question = cut(anchor.question, LINK_LIMITS.question)
  const response = cut(anchor.response_md, LINK_LIMITS.responseMd)
  return {
    v: 2,
    kind: 'anchor',
    source: 'ekagra',
    sentAt: now.toISOString(),
    truncated: selected.cut || question.cut || response.cut,
    anchor: {
      id: anchor.id,
      materialId: anchor.material_id,
      materialTitle: materialTitle?.slice(0, 200) ?? null,
      pageNo: anchor.page_no,
      action: anchor.action,
      selectedText: selected.text,
      question: question.text,
      responseMd: response.text,
      topicId: anchor.topic_id,
      createdAt: anchor.created_at,
    },
  }
}

/** The payload as base64url (URL-safe, no padding) of its UTF-8 JSON. */
export function encodePayload(payload: BridgePayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A payload from a link, or null when it's missing, too long, broken or another version. */
export function decodePayload(encoded: string | null | undefined): BridgePayload | null {
  if (!encoded || encoded.length > MAX_ENCODED_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (encoded.length % 4)) % 4)
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    const parsed = BridgePayloadSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Ekagra Studio on the web with the payload: `base` may have a path (e.g. https://example.com/studio). */
export function studioWebUrl(base: string, encoded: string): string {
  const url = new URL(base)
  url.searchParams.set(BRIDGE_PARAM, encoded)
  return url.toString()
}

/** A page of Ekagra Studio, e.g. 'notes/<id>': `base` may have a path (e.g. https://example.com/studio). */
export function studioPageUrl(base: string, page: string): string {
  const url = new URL(base)
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${page.replace(/^\/+/, '')}`
  return url.toString()
}

/** Ekagra Studio's Android app with the payload. */
export function studioDeepLink(encoded: string): string {
  return `${STUDIO_DEEP_LINK}?${BRIDGE_PARAM}=${encoded}`
}

/** VITE_STUDIO_URL when it's a web address, else Studio's development address. */
export function studioBase(configured: string | undefined): string {
  if (!configured) return DEFAULT_STUDIO_URL
  try {
    const url = new URL(configured)
    return url.protocol === 'http:' || url.protocol === 'https:' ? configured : DEFAULT_STUDIO_URL
  } catch {
    return DEFAULT_STUDIO_URL
  }
}

/** The payload in a link to Ekagra (?bridge_payload=… on the web, ekagra://anchor?bridge_payload=… on Android). */
export function payloadFromLink(link: string): BridgePayload | null {
  try {
    const url = new URL(link)
    if (url.protocol === 'ekagra:' && url.host !== 'anchor') return null
    return decodePayload(url.searchParams.get(BRIDGE_PARAM))
  } catch {
    return null
  }
}

/**
 * Where to start when the app was opened with ?bridge_payload=…: the anchor's address; '' when the
 * payload is broken (it's just left out); null when the link has none.
 */
export function launchRoute(href: string): string | null {
  const url = new URL(href)
  if (!url.searchParams.has(BRIDGE_PARAM)) return null
  const payload = payloadFromLink(href)
  return payload ? anchorRoute(payload) : ''
}

/** Where an anchor is in Ekagra: its PDF, at its page, with the anchor open. */
export function anchorRoute(payload: BridgePayload): string {
  const params = new URLSearchParams({ page: String(payload.anchor.pageNo), anchor: payload.anchor.id })
  return `/academics/library/${encodeURIComponent(payload.anchor.materialId)}?${params.toString()}`
}
