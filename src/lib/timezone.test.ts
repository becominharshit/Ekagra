import { describe, expect, it } from 'vitest'
import {
  clockInTimezone,
  dateKeyInTimezone,
  minuteOfInTimezone,
  resolveTimezone,
  timePartsInTimezone,
  zonedLocalToIso,
} from './timezone'

describe('UTC-normalized IANA timezone helpers', () => {
  it('computes calendar date and wall-clock minutes accurately across global timezones', () => {
    // 2026-11-02T22:30:00.000Z is still Nov 2 afternoon in NYC (EST, UTC-5 -> 17:30)
    // and already Nov 3 morning in Tokyo (JST, UTC+9 -> 07:30) and India (IST, UTC+5:30 -> 04:00).
    const instant = '2026-11-02T22:30:00.000Z'

    expect(dateKeyInTimezone(instant, 'America/New_York')).toBe('2026-11-02')
    expect(clockInTimezone(instant, 'America/New_York')).toBe('17:30')
    expect(minuteOfInTimezone(instant, 'America/New_York')).toBe(17 * 60 + 30)

    expect(dateKeyInTimezone(instant, 'Asia/Tokyo')).toBe('2026-11-03')
    expect(clockInTimezone(instant, 'Asia/Tokyo')).toBe('07:30')
    expect(minuteOfInTimezone(instant, 'Asia/Tokyo')).toBe(7 * 60 + 30)

    expect(dateKeyInTimezone(instant, 'Asia/Kolkata')).toBe('2026-11-03')
    expect(clockInTimezone(instant, 'Asia/Kolkata')).toBe('04:00')

    expect(timePartsInTimezone(instant, 'UTC').weekday).toBe(1) // Monday
    expect(timePartsInTimezone(instant, 'Asia/Tokyo').weekday).toBe(2) // Tuesday
  })

  it('converts local calendar date + minutes in a user IANA zone back to exact UTC ISO timestamps', () => {
    // Nov 2, 2026 14:30 (870 min) in New York (EST, UTC-5) -> 19:30 UTC
    expect(zonedLocalToIso('2026-11-02', 870, 'America/New_York')).toBe('2026-11-02T19:30:00.000Z')
    // Nov 2, 2026 14:30 in London (GMT, UTC+0) -> 14:30 UTC
    expect(zonedLocalToIso('2026-11-02', 870, 'Europe/London')).toBe('2026-11-02T14:30:00.000Z')
    // Nov 2, 2026 14:30 in India (IST, UTC+5:30) -> 09:00 UTC
    expect(zonedLocalToIso('2026-11-02', 870, 'Asia/Kolkata')).toBe('2026-11-02T09:00:00.000Z')
  })

  it('falls back safely when timezone string is invalid', () => {
    expect(() => resolveTimezone('Invalid/Zone')).not.toThrow()
    expect(resolveTimezone('Europe/Paris')).toBe('Europe/Paris')
  })
})
