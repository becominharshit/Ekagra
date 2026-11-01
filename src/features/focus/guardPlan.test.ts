import { describe, expect, it } from 'vitest'
import { focusRoute, guardPlan, sessionEndsAt, type GuardPlanInput } from './guardPlan'

const at = (time: string) => new Date(`2026-11-02T${time}:00`)
const iso = (time: string) => at(time).toISOString()
const block = (title: string, start: string, end: string, area = 'academics', status = 'planned') => ({ title, area, status, start_at: iso(start), end_at: iso(end) })

const base: GuardPlanInput = {
  now: at('14:20'),
  session: null,
  blocks: [block('Normalization', '14:00', '14:45'), block('Logo design', '15:00', '15:30', 'hustle')],
  blockDuring: 'focus_sessions',
  blockedPackages: ['com.instagram.android', 'com.google.android.youtube', 'com.instagram.android'],
  unlocksLeft: 2,
}

describe('what FocusGuard blocks', () => {
  it('blocks the picked apps while a focus session runs, until its timer ends (rounded up to the minute)', () => {
    expect(guardPlan({ ...base, session: { title: 'SQL joins', endsAt: at('14:44').getTime() + 20_000 } })).toEqual({
      title: 'SQL joins',
      endsAt: at('14:45').getTime(),
      blockedPackages: ['com.google.android.youtube', 'com.instagram.android'],
      emergencyUnlocksLeft: 2,
    })
  })

  it('blocks nothing without a session (unless every Study block is chosen), without picked apps, or once the timer is over', () => {
    expect(guardPlan(base)).toBeNull()
    expect(guardPlan({ ...base, blockedPackages: [], session: { title: 'SQL', endsAt: at('15:00').getTime() } })).toBeNull()
    expect(guardPlan({ ...base, session: { title: 'SQL', endsAt: at('14:10').getTime() } })).toBeNull()
  })

  it('with "Every Study block", blocks during study blocks too, until the later end', () => {
    const studying = guardPlan({ ...base, blockDuring: 'study_blocks' })
    expect(studying).toMatchObject({ title: 'Normalization', endsAt: at('14:45').getTime() })
    expect(guardPlan({ ...base, blockDuring: 'study_blocks', now: at('15:10') })).toBeNull() // a hustle block
    expect(guardPlan({ ...base, blockDuring: 'study_blocks', session: { title: 'SQL', endsAt: at('15:05').getTime() } })).toMatchObject({ title: 'SQL', endsAt: at('15:05').getTime() })
    const skipped = { ...base, blockDuring: 'study_blocks' as const, blocks: [block('Normalization', '14:00', '14:45', 'academics', 'missed')] }
    expect(guardPlan(skipped)).toBeNull()
  })

  it("knows when a session's timer ends, pauses included", () => {
    const pomodoro = { started_at: iso('14:00'), mode: 'pomodoro', planned_minutes: 40 } // 25 + 5 break + 15 = 45 minutes
    expect(sessionEndsAt(pomodoro, [], at('14:10'))).toBe(at('14:45').getTime())
    expect(sessionEndsAt(pomodoro, [{ from: iso('14:05'), to: iso('14:15') }], at('14:20'))).toBe(at('14:55').getTime())
    expect(sessionEndsAt(pomodoro, [{ from: iso('14:05'), to: null }], at('14:08'))).toBe(at('14:48').getTime()) // still paused: it keeps moving
  })
})

describe("the blocker screen's links", () => {
  it('opens the focus screen or the Tollbooth for the blocked app, and ignores other links', () => {
    expect(focusRoute('ekagra://focus')).toBe('/today/focus')
    expect(focusRoute('ekagra://focus/tollbooth?app=com.instagram.android&label=Instagram%20Lite')).toBe('/today/focus/tollbooth?app=com.instagram.android&label=Instagram+Lite')
    expect(focusRoute('ekagra://focus/tollbooth')).toBe('/today/focus/tollbooth')
    expect(focusRoute('ekagra://auth/callback?code=abc')).toBeNull()
    expect(focusRoute('https://example.com/focus')).toBeNull()
    expect(focusRoute('not a link')).toBeNull()
  })
})
