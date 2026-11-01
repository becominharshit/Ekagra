import { describe, expect, it } from 'vitest'
import { groupNameProblem, leaderboard, minutesLeft, runningSession, studyingNow, type Member } from './groups'

const WEEK = '2026-11-02'
const NOW = new Date('2026-11-04T14:00:00.000Z')

function member(name: string, values: { minutes?: number | null; board?: boolean; week?: string; until?: string | null; me?: boolean } = {}): Member {
  const until = values.until ?? null
  return {
    userId: name.toLowerCase(),
    name,
    role: 'member',
    me: values.me ?? false,
    stats: {
      user_id: name.toLowerCase(),
      display_name: name,
      week_start: values.week ?? WEEK,
      focus_minutes: values.minutes === undefined ? 100 : values.minutes,
      streak_days: 2,
      plan_pct: null,
      on_leaderboard: values.board ?? true,
      studying_until: until,
      studying_now: until !== null,
      updated_at: NOW.toISOString(),
    },
  }
}

describe('the leaderboard', () => {
  it("ranks this week's focus minutes of the members who opted in; equal minutes share a rank", () => {
    const board = leaderboard(
      [
        member('Riya', { minutes: 300 }),
        member('Kabir', { minutes: 120 }),
        member('Meera', { minutes: 300, me: true }),
        member('Aarav', { minutes: 500, board: false }), // not on the leaderboard
        member('Dev', { minutes: 900, week: '2026-10-26' }), // last week's numbers: 0 this week
        { ...member('Sana'), stats: null }, // hasn't set up sharing
      ],
      WEEK,
    )
    expect(board.map((row) => [row.rank, row.name, row.minutes, row.me])).toEqual([
      [1, 'Meera', 300, true],
      [1, 'Riya', 300, false],
      [3, 'Kabir', 120, false],
      [4, 'Dev', 0, false],
    ])
  })
})

describe('studying now and group focus', () => {
  it('lists who is studying, the one finishing first first', () => {
    const members = [member('Riya', { until: '2026-11-04T14:50:00.000Z' }), member('Kabir'), member('Meera', { until: '2026-11-04T14:20:00.000Z' })]
    expect(studyingNow(members).map((one) => one.name)).toEqual(['Meera', 'Riya'])
  })

  it('finds the group focus going on now, and the minutes left', () => {
    const session = (id: string, starts: string, ends: string) => ({ id, user_id: 'riya', minutes: 50, starts_at: starts, ends_at: ends })
    const sessions = [session('old', '2026-11-04T12:00:00.000Z', '2026-11-04T12:50:00.000Z'), session('now', '2026-11-04T13:40:00.000Z', '2026-11-04T14:30:00.000Z')]
    expect(runningSession(sessions, NOW)?.id).toBe('now')
    expect(runningSession(sessions.slice(0, 1), NOW)).toBeNull()
    expect(minutesLeft({ ends_at: '2026-11-04T14:29:30.000Z' }, NOW)).toBe(30)
  })

  it('checks group names', () => {
    expect(groupNameProblem('DBMS circle')).toBeNull()
    expect(groupNameProblem('  ')).toMatch(/name/)
    expect(groupNameProblem('x'.repeat(61))).toMatch(/60/)
  })
})
