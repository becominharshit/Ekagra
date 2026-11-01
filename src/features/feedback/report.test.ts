import { describe, expect, it } from 'vitest'
import { deviceSummary, feedbackText, messageProblem, screenName, screenshotProblem, statusLabel, toKind } from './report'

describe('screenName', () => {
  it.each([
    ['/today', 'Today'],
    ['/today/focus/tollbooth', 'Academic Tollbooth'],
    ['/academics/library', 'PDF library'],
    ['/academics/library/3f2a-material', 'PDF viewer'],
    ['/academics/subjects/s1', 'Subject'],
    ['/academics/subjects/s1/papers', 'Past papers'],
    ['/hustle/h1', 'Hustle details'],
    ['/me/', 'Me'],
    ['/me/focus', 'Focus setup'],
    ['/somewhere/else', 'Other'],
  ])('names %s "%s"', (path, name) => {
    expect(screenName(path)).toBe(name)
  })
})

describe('checks before sending', () => {
  it('needs a message, and not a huge one', () => {
    expect(messageProblem('')).toMatch(/Write a few words/)
    expect(messageProblem('  \n ')).toMatch(/Write a few words/)
    expect(messageProblem('x'.repeat(4001))).toMatch(/under 4000/)
    expect(messageProblem('The timer froze')).toBeNull()
  })

  it('takes PNG, JPG and WebP screenshots up to 10 MB', () => {
    expect(screenshotProblem({ type: 'image/png', size: 2_000_000 })).toBeNull()
    expect(screenshotProblem({ type: 'image/jpeg', size: 10 * 1024 * 1024 })).toBeNull()
    expect(screenshotProblem({ type: 'image/gif', size: 1000 })).toBe('Use a PNG, JPG or WebP image.')
    expect(screenshotProblem({ type: 'image/png', size: 11 * 1024 * 1024 })).toBe('That image is 11.0 MB. The limit is 10 MB.')
  })
})

describe('labels', () => {
  it('reads unknown kinds as "other" and shows statuses in plain words', () => {
    expect(toKind('bug')).toBe('bug')
    expect(toKind('rant')).toBe('other')
    expect(statusLabel('new')).toBe('Sent')
    expect(statusLabel('seen')).toBe('Read')
    expect(statusLabel('fixed')).toBe('Fixed')
  })
})

describe('feedback as text', () => {
  const context = { app: 'android', build: '2026-11-01 14:05', viewport: '412×915', browser: 'Mozilla/5.0', language: 'en-IN', timezone: 'Asia/Kolkata' }

  it('sums up the device in one line', () => {
    expect(deviceSummary(context)).toBe('Android app · build 2026-11-01 14:05 · 412×915')
    expect(deviceSummary({ app: 'web' })).toBe('Web app')
    expect(deviceSummary({})).toBe('')
    expect(deviceSummary([])).toBe('')
  })

  it('has the kind, the screen, the device and the message', () => {
    const text = feedbackText({
      kind: 'bug',
      message: 'The timer froze\nafter 10 minutes',
      screen: 'Focus',
      path: '/today/focus',
      context,
      created_at: '2026-11-01T09:00:00.000Z',
    })
    const lines = text.split('\n')
    expect(lines[0]).toBe('Ekagra feedback (Bug)')
    expect(lines[1]).toBe('Screen: Focus (/today/focus)')
    expect(lines[2]).toMatch(/^Written: 1 Nov 2026, /)
    expect(lines[3]).toBe('Device: Android app · build 2026-11-01 14:05 · 412×915')
    expect(lines.slice(4)).toEqual(['', 'The timer froze', 'after 10 minutes'])
  })

  it("leaves out what it doesn't know", () => {
    const text = feedbackText({ kind: 'idea', message: 'Dark mode', screen: null, path: null, context: {}, created_at: '2026-11-01T09:00:00.000Z' })
    expect(text).toContain('Screen: not given\n')
    expect(text).not.toContain('Device:')
  })
})
