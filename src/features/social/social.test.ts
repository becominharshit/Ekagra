import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHARING,
  firstName,
  formatCode,
  isCode,
  myNumbers,
  normalizeCode,
  nudgesLeft,
  nudgeText,
  readSharing,
  samePublished,
  sharedLines,
  studyingUntil,
  toPublished,
  type SharedStats,
} from './social'

// Wednesday 4 November 2026, 18:00 local; the week began on Monday 2 November.
const NOW = new Date(2026, 10, 4, 18)
const at = (day: number, hour = 10) => new Date(2026, 10, day, hour).toISOString()

describe('my numbers', () => {
  it("adds this week's focus, counts the streak of days with 15+ minutes, and the share of plan blocks done", () => {
    const numbers = myNumbers({
      now: NOW,
      focus: [
        { started_at: at(1), actual_minutes: 40 }, // Sunday, last week: streak only
        { started_at: at(2), actual_minutes: 25 },
        { started_at: at(3), actual_minutes: 10 },
        { started_at: at(3, 20), actual_minutes: 10 }, // Tuesday adds up to 20
        { started_at: at(4), actual_minutes: null }, // still running
      ],
      blocks: [
        { date: '2026-11-02', status: 'done' },
        { date: '2026-11-03', status: 'partial' },
        { date: '2026-11-03', status: 'missed' },
        { date: '2026-11-04', status: 'planned' },
        { date: '2026-10-30', status: 'missed' }, // last week
      ],
    })
    // Wednesday has no 15 minutes yet, but today only breaks the streak once it's over.
    expect(numbers).toEqual({ weekStart: '2026-11-02', focusMinutes: 45, streakDays: 3, planPct: 50 })
    expect(myNumbers({ now: NOW, focus: [], blocks: [] })).toEqual({ weekStart: '2026-11-02', focusMinutes: 0, streakDays: 0, planPct: null })
  })
})

describe('publishing', () => {
  const numbers = { weekStart: '2026-11-02', focusMinutes: 45, streakDays: 3, planPct: 50 }

  it('publishes only the numbers the student chose', () => {
    expect(toPublished({ ...DEFAULT_SHARING, displayName: ' Riya ' }, numbers, '2026-11-04T13:00:00.000Z')).toEqual({
      display_name: 'Riya',
      share_focus: true,
      share_streak: true,
      share_plan: false,
      share_studying: true,
      on_leaderboard: false,
      week_start: '2026-11-02',
      focus_minutes: 45,
      streak_days: 3,
      plan_pct: null,
      studying_until: '2026-11-04T13:00:00.000Z',
    })
    const quiet = toPublished({ displayName: '', focus: false, streak: false, plan: true, studying: false, leaderboard: false }, numbers, '2026-11-04T13:00:00.000Z')
    expect(quiet).toMatchObject({ display_name: 'Student', focus_minutes: null, streak_days: null, plan_pct: 50, studying_until: null })
  })

  it('knows when the saved row already says the same (times compared as moments)', () => {
    const row = toPublished({ ...DEFAULT_SHARING, displayName: 'Riya' }, numbers, '2026-11-04T13:00:00.000Z')
    const saved: SharedStats = {
      id: 'row-1',
      user_id: 'me',
      created_at: '2026-11-02T08:00:00+00:00',
      updated_at: '2026-11-04T08:00:00+00:00',
      display_name: 'Riya',
      share_focus: true,
      share_streak: true,
      share_plan: false,
      share_studying: true,
      on_leaderboard: false,
      week_start: '2026-11-02',
      focus_minutes: 45,
      streak_days: 3,
      plan_pct: null,
      studying_until: '2026-11-04T13:00:00+00:00', // as the database writes it
    }
    expect(samePublished(row, saved)).toBe(true)
    expect(samePublished(row, { ...saved, focus_minutes: 50 })).toBe(false)
  })

  it('shares focus minutes when on the leaderboard (it ranks them)', () => {
    expect(toPublished({ ...DEFAULT_SHARING, focus: false, leaderboard: true }, numbers, null)).toMatchObject({ share_focus: true, focus_minutes: 45, on_leaderboard: true })
  })

  it('works out until when someone is studying', () => {
    const session = { started_at: new Date(2026, 10, 4, 17, 30).toISOString(), planned_minutes: 50, ended_at: null }
    expect(studyingUntil(session, NOW)).toBe(new Date(2026, 10, 4, 18, 20).toISOString())
    expect(studyingUntil({ ...session, planned_minutes: 25 }, NOW)).toBeNull() // already over
    expect(studyingUntil({ ...session, ended_at: NOW.toISOString() }, NOW)).toBeNull()
    expect(studyingUntil(null, NOW)).toBeNull()
  })

  it('reads saved sharing and first names', () => {
    expect(readSharing(null)).toEqual(DEFAULT_SHARING)
    expect(readSharing({ display_name: 'Riya', share_focus: false, share_streak: true, share_plan: true, share_studying: false, on_leaderboard: false })).toEqual({
      displayName: 'Riya',
      focus: false,
      streak: true,
      plan: true,
      studying: false,
      leaderboard: false,
    })
    expect([firstName('Riya Sharma'), firstName('  '), firstName(null)]).toEqual(['Riya', 'Student', 'Student'])
  })
})

describe('codes, nudges and shared numbers', () => {
  it('reads codes however they are typed', () => {
    expect(formatCode('7F3A9C21B4')).toBe('7F3A9 C21B4')
    expect(normalizeCode(' 7f3a9-c21b4 ')).toBe('7F3A9C21B4')
    expect([isCode('7f3a9 c21b4'), isCode('HELLO'), isCode('7F3A9C21BZ')]).toEqual([true, false, false])
  })

  it('words nudges and counts how many are left today', () => {
    expect(nudgeText({ kind: 'study', message: null }, 'Riya')).toEqual({ title: 'Riya: Time to study', body: "It's study time. Open your plan and start one block." })
    expect(nudgeText({ kind: 'cheer', message: ' Proud of you! ' }, 'Riya').body).toBe('Proud of you!')
    const sent = [
      { to_user_id: 'aarav', created_at: new Date(2026, 10, 4, 9).toISOString() },
      { to_user_id: 'aarav', created_at: new Date(2026, 10, 3, 9).toISOString() }, // more than a day ago
      { to_user_id: 'riya', created_at: new Date(2026, 10, 4, 9).toISOString() },
    ]
    expect([nudgesLeft(sent, 'aarav', NOW), nudgesLeft(sent, 'kabir', NOW)]).toEqual([2, 3])
  })

  it("treats another week's focus and plan as none yet this week", () => {
    expect(sharedLines({ week_start: '2026-10-26', focus_minutes: 300, streak_days: 5, plan_pct: 80 }, '2026-11-02')).toEqual({ focusMinutes: 0, streakDays: 5, planPct: null })
    expect(sharedLines({ week_start: '2026-11-02', focus_minutes: null, streak_days: null, plan_pct: 60 }, '2026-11-02')).toEqual({ focusMinutes: null, streakDays: null, planPct: 60 })
  })
})
