import { describe, expect, it } from 'vitest'
import { notePageSlices, notePdfName } from './pdfPages'

describe('notePageSlices', () => {
  it('cuts a tall image into equal pages, with the last one shorter', () => {
    expect(notePageSlices(2500, 1000)).toEqual([
      { start: 0, height: 1000 },
      { start: 1000, height: 1000 },
      { start: 2000, height: 500 },
    ])
    expect(notePageSlices(1000, 1000)).toEqual([{ start: 0, height: 1000 }])
    expect(notePageSlices(0, 1000)).toEqual([])
  })

  it('ends a page at the last blank row, so text is not sliced', () => {
    // Row 945 is the space between two lines: the first page should end at 946, not at 1000.
    const blank = (y: number) => y === 945
    expect(notePageSlices(2500, 1000, blank)).toEqual([
      { start: 0, height: 946 },
      { start: 946, height: 1000 },
      { start: 1946, height: 554 },
    ])
  })

  it('keeps the full page when no blank row is found', () => {
    expect(notePageSlices(2500, 1000, () => false)).toEqual([
      { start: 0, height: 1000 },
      { start: 1000, height: 1000 },
      { start: 2000, height: 500 },
    ])
  })
})

describe('notePdfName', () => {
  it('makes a safe file name from the title', () => {
    expect(notePdfName('Electromagnetic waves')).toBe('Electromagnetic waves.pdf')
    expect(notePdfName('Unit 2: waves / optics?')).toBe('Unit 2- waves - optics.pdf')
    expect(notePdfName('   ')).toBe('Note.pdf')
  })
})
