import type { SourceCitation } from '@shared/schemas.ts'

// Source citation helpers shared across Ekagra and Ekagra Studio:
// - Parses inline [p. 12], [Page 12], (p. 12), and lecture timestamps (12:40) / (1:05:15)
// - Merges structured LLM citations without duplicates
// - Transforms plain-prose citations into internal cite:page/N and cite:time/SEC links
//   while leaving code blocks, inline code, LaTeX math, and existing links untouched.

const PROTECTED_SPAN_RE =
  /(```[\s\S]*?```|`[^`\n]+`|\$\$[\s\S]*?\$\$|\$[^$\n]+?\$|\[[^\]]*\]\([^)]*\))/g

const PAGE_TOKEN_RE = /(?:\[((?:p\.?|page)\s*\d{1,4})\]|\(((?:p\.?|page)\s*\d{1,4})\))/gi
const TIME_TOKEN_RE = /(?:\[(\d{1,2}:\d{2}(?::\d{2})?)\]|\((\d{1,2}:\d{2}(?::\d{2})?)\))/g
const PAGE_NUMBER_RE = /(?:p\.?|page)\s*(\d{1,4})/i

/** Parses `MM:SS` or `H:MM:SS` (optionally wrapped in brackets/parens) into whole seconds, or null if invalid. */
export function parseTimestampSec(raw: string): number | null {
  const cleaned = raw.trim().replace(/^[[(\s]+|[\])\s]+$/g, '')
  const parts = cleaned.split(':')
  if (parts.length !== 2 && parts.length !== 3) return null
  const nums = parts.map((part) => (/^\d+$/.test(part) ? Number(part) : Number.NaN))
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) return null
  if (parts.length === 2) {
    const [mins, secs] = nums
    if (mins === undefined || secs === undefined || secs >= 60) return null
    return mins * 60 + secs
  }
  const [hours, mins, secs] = nums
  if (hours === undefined || mins === undefined || secs === undefined || mins >= 60 || secs >= 60) return null
  return hours * 3600 + mins * 60 + secs
}

/** Formats whole seconds into `M:SS` or `H:MM:SS`. */
export function formatTimestampSec(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const mins = Math.floor((safe % 3600) / 60)
  const secs = safe % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`
}

/** Merges structured `citations` with inline PDF page and timestamp references found in Markdown. */
export function extractCitations(
  markdown: string,
  structured: readonly SourceCitation[] = [],
): SourceCitation[] {
  const seen = new Set<string>()
  const out: SourceCitation[] = []

  const push = (citation: SourceCitation) => {
    const pageNumber =
      typeof citation.pageNumber === 'number' && Number.isInteger(citation.pageNumber) && citation.pageNumber >= 1
        ? citation.pageNumber
        : null
    const timestampSec =
      typeof citation.timestampSec === 'number' && Number.isInteger(citation.timestampSec) && citation.timestampSec >= 0
        ? citation.timestampSec
        : null
    if (pageNumber === null && timestampSec === null) return
    const key = pageNumber !== null ? `p:${pageNumber}` : `t:${timestampSec}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({
      label: citation.label.trim() || (pageNumber !== null ? `p. ${pageNumber}` : formatTimestampSec(timestampSec!)),
      pageNumber,
      timestampSec,
      quote: citation.quote.trim(),
    })
  }

  for (const item of structured) push(item)

  // Scan outside protected code/math blocks so formulas/code indices are never mistaken for citations.
  const segments = markdown.split(PROTECTED_SPAN_RE)
  for (let i = 0; i < segments.length; i += 2) {
    const segment = segments[i] ?? ''
    if (!segment) continue
    PAGE_TOKEN_RE.lastIndex = 0
    let pageMatch: RegExpExecArray | null
    while ((pageMatch = PAGE_TOKEN_RE.exec(segment)) !== null) {
      const inner = pageMatch[1] ?? pageMatch[2] ?? ''
      const digits = PAGE_NUMBER_RE.exec(inner)?.[1]
      const pageNumber = digits ? Number(digits) : Number.NaN
      if (Number.isInteger(pageNumber) && pageNumber >= 1) {
        push({ label: `p. ${pageNumber}`, pageNumber, timestampSec: null, quote: '' })
      }
    }

    TIME_TOKEN_RE.lastIndex = 0
    let timeMatch: RegExpExecArray | null
    while ((timeMatch = TIME_TOKEN_RE.exec(segment)) !== null) {
      const clock = timeMatch[1] ?? timeMatch[2] ?? ''
      const sec = parseTimestampSec(clock)
      if (sec !== null) {
        push({ label: clock, pageNumber: null, timestampSec: sec, quote: '' })
      }
    }
  }

  return out
}

/** Rewrites plain-prose `[p. N]` and `(MM:SS)` markers into internal `cite:page/N` and `cite:time/SEC` links. */
export function linkifyCitationsInMarkdown(
  markdown: string,
  options: { enablePage?: boolean; enableTime?: boolean } = {},
): string {
  const { enablePage = false, enableTime = false } = options
  if (!enablePage && !enableTime) return markdown

  const segments = markdown.split(PROTECTED_SPAN_RE)
  return segments
    .map((segment, index) => {
      if (index % 2 === 1 || !segment) return segment
      let updated = segment
      if (enablePage) {
        updated = updated.replace(PAGE_TOKEN_RE, (_full, bracketed?: string, parened?: string) => {
          const inner = bracketed ?? parened ?? ''
          const digits = PAGE_NUMBER_RE.exec(inner)?.[1]
          const page = digits ? Number(digits) : Number.NaN
          if (!Number.isInteger(page) || page < 1) return _full
          return `[p. ${page}](cite:page/${page})`
        })
      }
      if (enableTime) {
        updated = updated.replace(TIME_TOKEN_RE, (full, bracketed?: string, parened?: string) => {
          const clock = bracketed ?? parened ?? ''
          const sec = parseTimestampSec(clock)
          if (sec === null) return full
          return `[${clock}](cite:time/${sec})`
        })
      }
      return updated
    })
    .join('')
}
