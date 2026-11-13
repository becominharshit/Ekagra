import { z } from 'zod'
import type { TablesInsert } from '@/types/database'

const OCCLUSION_PREFIX = '<!--ekagra-occlusion:'
const OCCLUSION_SUFFIX = '-->'

export const OcclusionMaskSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().trim().min(1).max(160),
  x: z.number().min(0).max(0.95),
  y: z.number().min(0).max(0.95),
  width: z.number().min(0.04).max(1),
  height: z.number().min(0.04).max(1),
})

export type OcclusionMask = z.infer<typeof OcclusionMaskSchema>

export const OcclusionPayloadSchema = z
  .object({
    version: z.literal(1),
    prompt: z.string().trim().min(1).max(240),
    imageUrl: z.string().min(1).max(350_000),
    activeMaskIndex: z.number().int().min(0),
    masks: z.array(OcclusionMaskSchema).min(1).max(12),
  })
  .refine((data) => data.activeMaskIndex < data.masks.length, {
    message: 'activeMaskIndex must point to an existing mask',
  })

export type OcclusionPayload = z.infer<typeof OcclusionPayloadSchema>

/** Built-in offline vector diagram so users can test Image Occlusion without uploading a photo first. */
const SAMPLE_DIAGRAM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 420" width="800" height="420">
  <rect width="800" height="420" rx="20" fill="#f8fafc"/>
  <text x="400" y="48" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" font-weight="700" fill="#0f172a">Web Request Lifecycle</text>
  <rect x="44" y="130" width="190" height="110" rx="14" fill="#e0f2fe" stroke="#0284c7" stroke-width="2.5"/>
  <text x="139" y="192" text-anchor="middle" font-family="system-ui,sans-serif" font-size="20" font-weight="600" fill="#0369a1">Client Browser</text>
  <line x1="234" y1="185" x2="305" y2="185" stroke="#475569" stroke-width="3"/>
  <polygon points="305,178 320,185 305,192" fill="#475569"/>
  <rect x="320" y="130" width="190" height="110" rx="14" fill="#fef3c7" stroke="#d97706" stroke-width="2.5"/>
  <text x="415" y="192" text-anchor="middle" font-family="system-ui,sans-serif" font-size="20" font-weight="600" fill="#92400e">API Gateway</text>
  <line x1="510" y1="185" x2="575" y2="185" stroke="#475569" stroke-width="3"/>
  <polygon points="575,178 590,185 575,192" fill="#475569"/>
  <rect x="590" y="130" width="170" height="110" rx="14" fill="#dcfce7" stroke="#16a34a" stroke-width="2.5"/>
  <text x="675" y="192" text-anchor="middle" font-family="system-ui,sans-serif" font-size="20" font-weight="600" fill="#166534">PostgreSQL</text>
  <rect x="195" y="295" width="410" height="72" rx="12" fill="#ede9fe" stroke="#7c3aed" stroke-width="2"/>
  <text x="400" y="338" text-anchor="middle" font-family="system-ui,sans-serif" font-size="18" font-weight="600" fill="#5b21b6">Row Level Security (auth.uid)</text>
</svg>`

export const SAMPLE_OCCLUSION_IMAGE_URL = `data:image/svg+xml;utf8,${encodeURIComponent(SAMPLE_DIAGRAM_SVG)}`

export const SAMPLE_OCCLUSION_MASKS: OcclusionMask[] = [
  { id: 'mask-client', label: 'Client Browser', x: 0.055, y: 0.31, width: 0.24, height: 0.265 },
  { id: 'mask-gateway', label: 'API Gateway', x: 0.4, y: 0.31, width: 0.24, height: 0.265 },
  { id: 'mask-db', label: 'PostgreSQL', x: 0.735, y: 0.31, width: 0.215, height: 0.265 },
]

export function clampNormalizedBox(box: Pick<OcclusionMask, 'x' | 'y' | 'width' | 'height'>): {
  x: number
  y: number
  width: number
  height: number
} {
  const width = Math.min(1, Math.max(0.06, Number(box.width.toFixed(4))))
  const height = Math.min(1, Math.max(0.06, Number(box.height.toFixed(4))))
  const x = Math.min(1 - width, Math.max(0, Number(box.x.toFixed(4))))
  const y = Math.min(1 - height, Math.max(0, Number(box.y.toFixed(4))))
  return { x, y, width, height }
}

/** Encode an Image Occlusion card cleanly inside `flashcards.front` so Postgres & Demo DB schemas stay in 1:1 parity. */
export function encodeOcclusionFront(payload: OcclusionPayload): string {
  const normalized: OcclusionPayload = {
    ...payload,
    masks: payload.masks.map((mask) => ({ ...mask, ...clampNormalizedBox(mask), label: mask.label.trim() })),
  }
  const parsed = OcclusionPayloadSchema.parse(normalized)
  const visibleHeading = occlusionPrompt(parsed)
  return `${visibleHeading}\n${OCCLUSION_PREFIX}${JSON.stringify(parsed)}${OCCLUSION_SUFFIX}`
}

/** Parse an Image Occlusion payload out of `flashcards.front`, returning null for normal text cards. */
export function parseOcclusionFront(front: string): OcclusionPayload | null {
  const start = front.lastIndexOf(OCCLUSION_PREFIX)
  if (start === -1) return null
  const jsonStart = start + OCCLUSION_PREFIX.length
  const end = front.indexOf(OCCLUSION_SUFFIX, jsonStart)
  if (end === -1) return null
  try {
    const raw: unknown = JSON.parse(front.slice(jsonStart, end))
    const parsed = OcclusionPayloadSchema.safeParse(raw)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function occlusionPrompt(payload: Pick<OcclusionPayload, 'prompt' | 'activeMaskIndex' | 'masks'>): string {
  return `${payload.prompt.trim()} (Region ${payload.activeMaskIndex + 1} of ${payload.masks.length})`
}

/** Human-readable front label (never exposes base64/JSON markers in lists, search summaries, or alerts). */
export function occlusionSummaryLabel(front: string): string {
  const parsed = parseOcclusionFront(front)
  return parsed ? occlusionPrompt(parsed) : front
}

/** Build one `ts-fsrs` flashcard row per labeled occlusion mask so each box schedules independently. */
export function buildOcclusionCards(input: {
  prompt: string
  imageUrl: string
  masks: OcclusionMask[]
  topicId: string | null
}): TablesInsert<'flashcards'>[] {
  const prompt = input.prompt.trim()
  if (!prompt || !input.imageUrl.trim() || input.masks.length === 0) return []
  return input.masks.map((mask, activeMaskIndex) => {
    const front = encodeOcclusionFront({
      version: 1,
      prompt,
      imageUrl: input.imageUrl,
      activeMaskIndex,
      masks: input.masks,
    })
    return {
      front,
      back: mask.label.trim(),
      topic_id: input.topicId,
      source: 'manual',
    }
  })
}
