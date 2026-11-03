import { describe, expect, it } from 'vitest'
import { kindLabel, materialSummary } from './kinds'

describe('naming materials', () => {
  it('says what kind each is, with its pages or length', () => {
    expect(materialSummary({ kind: 'pdf', page_count: 12, duration_sec: null })).toBe('PDF · 12 pages')
    expect(materialSummary({ kind: 'youtube', page_count: null, duration_sec: 7155 })).toBe('YouTube video · 1 h 59 min')
    expect(materialSummary({ kind: 'youtube', page_count: null, duration_sec: null })).toBe('YouTube video')
    expect(materialSummary({ kind: 'image', page_count: null, duration_sec: null })).toBe('Photo')
    expect(materialSummary({ kind: 'text', page_count: 1, duration_sec: null })).toBe('Text')
    expect(kindLabel('audio')).toBe('File')
  })
})
