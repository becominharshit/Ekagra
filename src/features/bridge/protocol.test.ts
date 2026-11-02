import { describe, expect, it } from 'vitest'
import {
  anchorPayload,
  anchorRoute,
  BRIDGE_CHANNEL,
  decodePayload,
  encodePayload,
  launchRoute,
  LINK_LIMITS,
  payloadFromLink,
  readMessage,
  studioBase,
  studioDeepLink,
  studioPageUrl,
  studioWebUrl,
} from './protocol'

const NOW = new Date('2026-11-02T09:00:00.000Z')
const ANCHOR = {
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  material_id: 'm1b2c3d4-0000-4000-8000-000000000002',
  page_no: 12,
  action: 'explain',
  selected_text: 'BCNF: every determinant is a candidate key ✓',
  question: null,
  response_md: '**BCNF** is stricter than 3NF — हिंदी too.',
  topic_id: null,
  created_at: '2026-11-01T10:00:00+00:00',
}

describe('the Studio Bridge payload', () => {
  it('describes an anchor, and survives the trip through a link (any text, Hindi and symbols too)', () => {
    const payload = anchorPayload(ANCHOR, 'DBMS notes', NOW)
    expect(payload).toMatchObject({ v: 2, kind: 'anchor', source: 'ekagra', sentAt: NOW.toISOString(), truncated: false })
    expect(payload.anchor).toMatchObject({ id: ANCHOR.id, materialId: ANCHOR.material_id, materialTitle: 'DBMS notes', pageNo: 12, action: 'explain' })
    const encoded = encodePayload(payload)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/) // URL-safe base64, no padding
    expect(decodePayload(encoded)).toEqual(payload)
  })

  it('cuts long texts to fit a link, and says so', () => {
    const payload = anchorPayload({ ...ANCHOR, response_md: 'x'.repeat(9000) }, null, NOW)
    expect(payload.truncated).toBe(true)
    expect(payload.anchor.responseMd).toHaveLength(LINK_LIMITS.responseMd)
    expect(payload.anchor.responseMd?.endsWith('…')).toBe(true)
  })

  it('ignores broken, foreign or other-version payloads', () => {
    const encoded = encodePayload(anchorPayload(ANCHOR, null, NOW))
    expect(decodePayload(null)).toBeNull()
    expect(decodePayload('not base64!')).toBeNull()
    expect(decodePayload(encoded.slice(0, 40))).toBeNull()
    const plain = anchorPayload({ ...ANCHOR, selected_text: 'BCNF', response_md: 'Stricter than 3NF' }, null, NOW)
    const v1 = btoa(JSON.stringify({ ...plain, v: 1 })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(decodePayload(v1)).toBeNull()
    expect(decodePayload('A'.repeat(20_000))).toBeNull()
  })
})

describe('links and messages', () => {
  const encoded = encodePayload(anchorPayload(ANCHOR, 'DBMS notes', NOW))

  it('makes Studio links for the web (VITE_STUDIO_URL, with or without a path) and Android', () => {
    expect(studioWebUrl('http://localhost:5174', encoded)).toBe(`http://localhost:5174/?bridge_payload=${encoded}`)
    expect(studioWebUrl('https://ekagra.example/studio', encoded)).toBe(`https://ekagra.example/studio?bridge_payload=${encoded}`)
    expect(studioDeepLink(encoded)).toBe(`ekagra-studio://anchor?bridge_payload=${encoded}`)
    expect([studioBase(undefined), studioBase('https://studio.example'), studioBase('javascript:alert(1)'), studioBase('nonsense')]).toEqual([
      'http://localhost:5174',
      'https://studio.example',
      'http://localhost:5174',
      'http://localhost:5174',
    ])
  })

  it('links to pages of Studio (notes, subjects), with or without a path in VITE_STUDIO_URL', () => {
    expect(studioPageUrl('http://localhost:5174', 'notes/n1')).toBe('http://localhost:5174/notes/n1')
    expect(studioPageUrl('https://ekagra.example/studio/', '/subjects/s1')).toBe('https://ekagra.example/studio/subjects/s1')
  })

  it('reads a payload from a link to Ekagra, and opens the anchor at its page', () => {
    const payload = payloadFromLink(`http://localhost:5173/?bridge_payload=${encoded}`)
    expect(payload?.anchor.id).toBe(ANCHOR.id)
    expect(payloadFromLink(`ekagra://anchor?bridge_payload=${encoded}`)?.anchor.pageNo).toBe(12)
    expect(payloadFromLink(`ekagra://focus?bridge_payload=${encoded}`)).toBeNull()
    expect(payloadFromLink('http://localhost:5173/today')).toBeNull()
    expect(anchorRoute(payload ?? anchorPayload(ANCHOR, null, NOW))).toBe(`/academics/library/${ANCHOR.material_id}?page=12&anchor=${ANCHOR.id}`)
  })

  it('starts the app at the anchor it was opened with (a broken payload is just left out)', () => {
    expect(launchRoute(`http://localhost:5173/?bridge_payload=${encoded}`)).toBe(`/academics/library/${ANCHOR.material_id}?page=12&anchor=${ANCHOR.id}`)
    expect(launchRoute('http://localhost:5173/today?bridge_payload=broken')).toBe('')
    expect(launchRoute('http://localhost:5173/today')).toBeNull()
  })

  it('reads BroadcastChannel messages on the v2 channel, and nothing else', () => {
    expect(BRIDGE_CHANNEL).toBe('ekagra_app2_studio_bridge_v2')
    const payload = anchorPayload(ANCHOR, null, NOW)
    expect(readMessage({ v: 2, op: 'upsert', source: 'ekagra-studio', payload })).toMatchObject({ op: 'upsert' })
    expect(readMessage({ v: 2, op: 'delete', source: 'ekagra-studio', anchorId: ANCHOR.id })).toMatchObject({ op: 'delete', anchorId: ANCHOR.id })
    expect(readMessage({ v: 1, op: 'upsert', source: 'ekagra-studio', payload })).toBeNull()
    expect(readMessage({ v: 2, op: 'explode', source: 'ekagra-studio' })).toBeNull()
    expect(readMessage('hello')).toBeNull()
  })
})
