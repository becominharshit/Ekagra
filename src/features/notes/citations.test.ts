import { describe, expect, it } from 'vitest'
import { extractCitations, formatTimestampSec, linkifyCitationsInMarkdown, parseTimestampSec } from './citations'

describe('parseTimestampSec & formatTimestampSec', () => {
  it('parses MM:SS and H:MM:SS timestamps and ignores invalid strings', () => {
    expect(parseTimestampSec('12:40')).toBe(760)
    expect(parseTimestampSec('(1:05:15)')).toBe(3915)
    expect(parseTimestampSec('0:00')).toBe(0)
    expect(parseTimestampSec('12:65')).toBeNull()
    expect(parseTimestampSec('abc')).toBeNull()
  })

  it('formats seconds back cleanly', () => {
    expect(formatTimestampSec(760)).toBe('12:40')
    expect(formatTimestampSec(3915)).toBe('1:05:15')
  })
})

describe('extractCitations', () => {
  it('merges structured citations and inline PDF page / timestamp citations without duplicates', () => {
    const md = [
      'BCNF eliminates redundancy [p. 12] and see [Page 14].',
      'Also covered at (12:40) and recap [1:05:15].',
      'Skip code `arr[p. 99]` and math $f(9:99)$ inside math spans.',
    ].join('\n')
    expect(extractCitations(md, [{ label: 'p. 12', pageNumber: 12, timestampSec: null, quote: 'BCNF definition' }])).toEqual([
      { label: 'p. 12', pageNumber: 12, timestampSec: null, quote: 'BCNF definition' },
      { label: 'p. 14', pageNumber: 14, timestampSec: null, quote: '' },
      { label: '12:40', pageNumber: null, timestampSec: 760, quote: '' },
      { label: '1:05:15', pageNumber: null, timestampSec: 3915, quote: '' },
    ])
  })
})

describe('linkifyCitationsInMarkdown', () => {
  it('linkifies plain prose citations without altering LaTeX math, code blocks, or existing links', () => {
    const md = 'Review [p. 5] and ## Topic (12:40)\n\n```py\n# [p. 99]\nx = a[1:2]\n```\n\nFormula $t(0:30)$ stays untouched.'
    const out = linkifyCitationsInMarkdown(md, { enablePage: true, enableTime: true })
    expect(out).toContain('Review [p. 5](cite:page/5)')
    expect(out).toContain('## Topic [12:40](cite:time/760)')
    expect(out).toContain('# [p. 99]')
    expect(out).toContain('$t(0:30)$')
  })
})
