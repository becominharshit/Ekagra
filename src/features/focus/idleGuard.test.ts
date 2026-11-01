import { describe, expect, it } from 'vitest'
import { guardsSession, idlePauseAt } from './idleGuard'
import { scheduleFor } from './timer'

const START = '2026-11-02T10:00:00.000Z'
const at = (minutes: number) => new Date(Date.parse(START) + minutes * 60_000)
const iso = (minutes: number) => at(minutes).toISOString()
/** Within a second of `expected` (the guard works to the second). */
const near = (actual: Date | null, expected: Date) => actual !== null && Math.abs(actual.getTime() - expected.getTime()) < 1000

describe('the idle guard', () => {
  const pomodoro = scheduleFor('pomodoro', 50) // 25 focus, 5 break, 25 focus

  it('pauses 4 minutes of focus after the last tap, scroll or key press, also when noticed later', () => {
    expect(idlePauseAt(pomodoro, START, [], at(2), at(5))).toBeNull() // 3 minutes: not yet
    expect(near(idlePauseAt(pomodoro, START, [], at(2), at(6.5)), at(6))).toBe(true)
    // Back from the background 20 minutes later: the pause still starts at minute 6.
    expect(near(idlePauseAt(pomodoro, START, [], at(2), at(22)), at(6))).toBe(true)
  })

  it("doesn't count breaks or earlier pauses toward the 4 minutes", () => {
    // 2 minutes before the break + the 5-minute break + 2 minutes after it.
    expect(near(idlePauseAt(pomodoro, START, [], at(23), at(40)), at(32))).toBe(true)
    // 1 minute, then paused for 3, then 3 more.
    expect(near(idlePauseAt(pomodoro, START, [{ from: iso(3), to: iso(6) }], at(2), at(20)), at(9))).toBe(true)
  })

  it('does nothing while paused or once the time is up', () => {
    expect(idlePauseAt(pomodoro, START, [{ from: iso(4), to: null }], at(2), at(30))).toBeNull() // only 2 minutes before the pause
    const short = scheduleFor('custom', 10)
    expect(idlePauseAt(short, START, [], at(8), at(30))).toBeNull() // the 10 minutes ended 2 minutes after the last tap
  })

  it('watches study sessions only, unless it is switched off', () => {
    expect(guardsSession({ area: 'academics' }, true, false)).toBe(true)
    expect(guardsSession({ area: 'hustle' }, true, false)).toBe(false)
    expect(guardsSession({ area: 'academics' }, false, false)).toBe(false) // off in the settings
    expect(guardsSession({ area: 'academics' }, true, true)).toBe(false) // "I'm studying away from the screen"
  })
})
