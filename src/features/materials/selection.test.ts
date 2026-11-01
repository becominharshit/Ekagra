import { describe, expect, it } from 'vitest'
import { cleanSelection, rectStyle, relativeRect, toPageRect } from './selection'

const PAGE = { left: 100, top: 50, width: 400, height: 800 }

describe('relativeRect', () => {
  it('gives the selection as parts of the page size', () => {
    expect(relativeRect({ left: 200, top: 250, width: 100, height: 40 }, PAGE)).toEqual({ x: 0.25, y: 0.25, w: 0.25, h: 0.05 })
  })

  it('cuts off what sticks out of the page', () => {
    expect(relativeRect({ left: 400, top: 800, width: 300, height: 100 }, PAGE)).toEqual({ x: 0.75, y: 0.9375, w: 0.25, h: 0.0625 })
  })

  it('ignores empty selections and selections outside the page', () => {
    expect(relativeRect({ left: 200, top: 250, width: 0, height: 10 }, PAGE)).toBeNull()
    expect(relativeRect({ left: 600, top: 250, width: 50, height: 10 }, PAGE)).toBeNull()
  })
})

describe('saved rects', () => {
  it('reads a saved rect, and turns anything broken into null', () => {
    expect(toPageRect({ x: 0.1, y: 0.2, w: 0.3, h: 0.05 })).toEqual({ x: 0.1, y: 0.2, w: 0.3, h: 0.05 })
    expect(toPageRect({ x: 0.1, y: '0.2', w: 0.3, h: 0.05 })).toBeNull()
    expect(toPageRect(null)).toBeNull()
  })

  it('positions a box over the page in percent', () => {
    expect(rectStyle({ x: 0.25, y: 0.5, w: 0.125, h: 0.05 })).toEqual({ left: '25%', top: '50%', width: '12.5%', height: '5%' })
  })
})

describe('cleanSelection', () => {
  it('joins the lines of a PDF selection into one tidy line', () => {
    expect(cleanSelection('  Every   determinant\n is a\tsuperkey. ')).toBe('Every determinant is a superkey.')
  })
})
