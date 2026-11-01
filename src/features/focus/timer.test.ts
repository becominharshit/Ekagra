import { describe, expect, it } from 'vitest'
import { clockLabel, pauseAt, pausedMs, phaseLabel, resumeAt, roundsWork, scheduleFor, scheduleMinutes, timerAt, timerRhythm, workThatFits } from './timer'

const START = '2026-11-02T10:00:00.000Z'
const at = (minutes: number) => new Date(Date.parse(START) + minutes * 60_000)

describe('the focus schedule', () => {
  it('makes Pomodoro 25/5 and Deep work 50/10 stretches, with no break at the end; custom is one stretch', () => {
    expect(scheduleFor('pomodoro', 40)).toEqual([
      { kind: 'work', minutes: 25 },
      { kind: 'break', minutes: 5 },
      { kind: 'work', minutes: 15 },
    ])
    expect(scheduleFor('deep', 100)).toEqual([
      { kind: 'work', minutes: 50 },
      { kind: 'break', minutes: 10 },
      { kind: 'work', minutes: 50 },
    ])
    expect(scheduleFor('custom', 35)).toEqual([{ kind: 'work', minutes: 35 }])
    expect(scheduleFor('pomodoro', 25, { pomodoro: { work: 20, break: 4 }, deep: { work: 50, break: 10 } })).toEqual([
      { kind: 'work', minutes: 20 },
      { kind: 'break', minutes: 4 },
      { kind: 'work', minutes: 5 },
    ])
    expect(scheduleMinutes(scheduleFor('pomodoro', 40))).toBe(45)
    expect([timerRhythm('pomodoro'), timerRhythm('deep'), timerRhythm('custom')]).toEqual([
      '25 min focus, 5 min break',
      '50 min focus, 10 min break',
      'Your minutes, no breaks',
    ])
  })

  it('fits focus into a plan block: a 45-minute block holds 25 + 15 minutes of Pomodoro focus', () => {
    expect(workThatFits('pomodoro', 45)).toBe(40)
    expect(workThatFits('pomodoro', 40)).toBe(35) // 25 focus + 5 break + 10 focus
    expect(workThatFits('pomodoro', 35)).toBe(25) // 5 minutes after a break isn't worth it
    expect(workThatFits('pomodoro', 20)).toBe(20) // a short block is one stretch
    expect(workThatFits('deep', 45)).toBe(45)
    expect(workThatFits('deep', 120)).toBe(100) // 50 focus + 10 break + 50 focus
    expect(workThatFits('custom', 45)).toBe(45)
    expect(roundsWork('pomodoro', 4)).toBe(100)
  })
})

describe('the timer', () => {
  const phases = scheduleFor('pomodoro', 40) // 25 focus, 5 break, 15 focus

  it('shows the phase, round and time left; breaks do not count as focus', () => {
    expect(timerAt(phases, START, [], at(10))).toMatchObject({ phase: { kind: 'work' }, index: 0, round: 1, rounds: 2, phaseLeft: 15 * 60, focused: 10 * 60, done: false })
    expect(timerAt(phases, START, [], at(27))).toMatchObject({ phase: { kind: 'break' }, index: 1, round: 1, phaseLeft: 3 * 60, focused: 25 * 60 })
    expect(timerAt(phases, START, [], at(31))).toMatchObject({ phase: { kind: 'work' }, index: 2, round: 2, phaseLeft: 14 * 60, focused: 26 * 60 })
    expect(timerAt(phases, START, [], at(90))).toMatchObject({ phase: null, index: 3, done: true, focused: 40 * 60, plannedFocus: 40 * 60 })
  })

  it('freezes during pauses (also one still running)', () => {
    const pauses = [
      { from: at(5).toISOString(), to: at(8).toISOString() },
      { from: at(20).toISOString(), to: null },
    ]
    expect(pausedMs(pauses, at(23))).toBe(6 * 60_000)
    expect(timerAt(phases, START, pauses, at(23))).toMatchObject({ phase: { kind: 'work' }, focused: 17 * 60, phaseLeft: 8 * 60, paused: true })
    // Still paused 10 minutes later: nothing moved.
    expect(timerAt(phases, START, pauses, at(33)).focused).toBe(17 * 60)
  })

  it('pauses and resumes; pausing while paused changes nothing', () => {
    const paused = pauseAt([], at(5))
    expect(paused).toEqual([{ from: at(5).toISOString(), to: null }])
    expect(pauseAt(paused, at(6))).toBe(paused)
    const resumed = resumeAt(paused, at(8))
    expect(resumed).toEqual([{ from: at(5).toISOString(), to: at(8).toISOString() }])
    expect(pauseAt(resumed, at(12))).toHaveLength(2)
    expect(resumeAt(resumed, at(9))).toEqual(resumed)
    // The idle guard's pauses say so.
    const idle = pauseAt(resumed, at(20), true)
    expect(idle.at(-1)).toEqual({ from: at(20).toISOString(), to: null, idle: true })
    expect(timerAt(phases, START, idle, at(22))).toMatchObject({ paused: true, idle: true })
    expect(timerAt(phases, START, resumeAt(idle, at(23)), at(24))).toMatchObject({ paused: false, idle: false })
  })

  it('says what the timer is doing, and writes the clock as minutes and seconds', () => {
    expect(phaseLabel(timerAt(phases, START, [], at(10)))).toBe('Focus 1 of 2')
    expect(phaseLabel(timerAt(phases, START, [], at(27)))).toBe('Break')
    expect(phaseLabel(timerAt(phases, START, [{ from: at(2).toISOString(), to: null }], at(10)))).toBe('Paused')
    expect(phaseLabel(timerAt(phases, START, [{ from: at(2).toISOString(), to: null, idle: true }], at(10)))).toBe('Paused: no activity')
    expect(phaseLabel(timerAt(phases, START, [], at(50)))).toBe("Time's up")
    expect(phaseLabel(timerAt(scheduleFor('custom', 30), START, [], at(10)))).toBe('Focus')
    expect([clockLabel(605), clockLabel(59.2), clockLabel(4500), clockLabel(-3)]).toEqual(['10:05', '1:00', '75:00', '0:00'])
  })
})
