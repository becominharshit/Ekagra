// Where on a PDF page the student selected text, saved with an AI Anchor so its answer can be
// shown at the same spot later, whatever the screen size. Plain functions, tested on their own.

/** A box on the page, as parts of the page size (0–1), like ai_anchors.rect. */
export interface PageRect {
  x: number
  y: number
  w: number
  h: number
}

interface BoxLike {
  left: number
  top: number
  width: number
  height: number
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const round4 = (value: number) => Math.round(value * 10_000) / 10_000

/** The selection's box relative to the page box, or null when it is empty or outside the page. */
export function relativeRect(selection: BoxLike, page: BoxLike): PageRect | null {
  if (page.width <= 0 || page.height <= 0 || selection.width <= 0 || selection.height <= 0) return null
  const left = clamp01((selection.left - page.left) / page.width)
  const top = clamp01((selection.top - page.top) / page.height)
  const right = clamp01((selection.left + selection.width - page.left) / page.width)
  const bottom = clamp01((selection.top + selection.height - page.top) / page.height)
  if (right <= left || bottom <= top) return null
  return { x: round4(left), y: round4(top), w: round4(right - left), h: round4(bottom - top) }
}

/** Reads a saved rect (from JSON); anything broken becomes null. */
export function toPageRect(value: unknown): PageRect | null {
  if (typeof value !== 'object' || value === null) return null
  const { x, y, w, h } = value as Record<string, unknown>
  const numbers = [x, y, w, h]
  if (!numbers.every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  return { x: Number(x), y: Number(y), w: Number(w), h: Number(h) }
}

/** CSS position for a box drawn over the page. */
export function rectStyle(rect: PageRect): { left: string; top: string; width: string; height: string } {
  const percent = (value: number) => `${round4(value * 100)}%`
  return { left: percent(rect.x), top: percent(rect.y), width: percent(rect.w), height: percent(rect.h) }
}

/** Selected text as one tidy line (PDF text layers add odd spaces and line breaks), at most 4,000 characters. */
export function cleanSelection(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 4000)
}
