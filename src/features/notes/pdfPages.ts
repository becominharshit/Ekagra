// Pure pagination helpers for a note's PDF (exportNotePdf.ts uses them; tested without a browser).

export interface PageSlice {
  start: number
  height: number
}

/**
 * Cuts a tall image into pages. `blankRow(y)` says whether that row of pixels is empty; when it is
 * given, a page ends at the last blank row instead of at the exact page height, so a line of text
 * is not cut in two.
 */
export function notePageSlices(height: number, pageHeight: number, blankRow?: (y: number) => boolean): PageSlice[] {
  if (height <= 0 || pageHeight <= 0) return []
  const slices: PageSlice[] = []
  let start = 0
  while (start < height) {
    const ideal = Math.min(height, start + pageHeight)
    let end = ideal
    if (ideal < height && blankRow) {
      // Look back over the bottom fifth of the page for a clear line between two lines of text.
      const floor = start + Math.floor(pageHeight * 0.8)
      for (let y = ideal - 1; y > floor; y -= 1) {
        if (blankRow(y)) {
          end = y + 1
          break
        }
      }
    }
    slices.push({ start, height: end - start })
    start = end
  }
  return slices
}

/** A safe file name from a note's title. */
export function notePdfName(title: string): string {
  const clean = title
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .replace(/[-. ]+$/, '')
  return `${clean || 'Note'}.pdf`
}
