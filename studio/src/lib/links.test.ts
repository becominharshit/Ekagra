import { describe, expect, it } from 'vitest'
import { pageUrl, safeNext, webBase } from './links'

describe('links between the apps', () => {
  it("uses the configured address only when it's a web address", () => {
    expect([webBase(undefined, 'http://localhost:5173'), webBase('https://ekagra.example', 'x'), webBase('javascript:alert(1)', 'x'), webBase('nope', 'x')]).toEqual([
      'http://localhost:5173',
      'https://ekagra.example',
      'x',
      'x',
    ])
  })

  it('joins a page onto an address, with or without a path', () => {
    expect(pageUrl('http://localhost:5173', 'privacy')).toBe('http://localhost:5173/privacy')
    expect(pageUrl('https://example.com/ekagra/', '/academics')).toBe('https://example.com/ekagra/academics')
    expect(pageUrl('http://localhost:5173', '')).toBe('http://localhost:5173/')
  })

  it('only returns to pages of this app after signing in', () => {
    expect(safeNext('/notes/abc?x=1')).toBe('/notes/abc?x=1')
    expect([safeNext(null), safeNext('https://evil.example'), safeNext('//evil.example'), safeNext('/\\evil.example')]).toEqual(['/', '/', '/', '/'])
  })
})
