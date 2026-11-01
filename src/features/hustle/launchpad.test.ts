import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { finishLaunch, minutesToLog, normalizeUrl, parseLinks, platformsFor, saveLinks, secondsLeft, type ActiveLaunch } from './launchpad'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const START = new Date('2026-11-02T18:00:00.000Z')
const minutesLater = (minutes: number) => new Date(START.getTime() + minutes * 60_000)
const launch: ActiveLaunch = {
  id: '00000000-0000-4000-8000-000000000001',
  hustleId: 'logos',
  hustleName: 'Logo design',
  platform: 'Upwork',
  url: 'https://www.upwork.com/',
  intention: 'Send 3 proposals',
  startedAt: START.toISOString(),
  minutes: 10,
}

describe('the Launchpad', () => {
  it('counts down from 10 minutes, and logs the time it ran (1 to 15 minutes)', () => {
    expect(secondsLeft(launch, minutesLater(2.5))).toBe(450)
    expect(secondsLeft(launch, minutesLater(12))).toBe(-120)
    expect([minutesToLog(launch, minutesLater(0.2)), minutesToLog(launch, minutesLater(9)), minutesToLog(launch, minutesLater(120))]).toEqual([1, 9, 15])
  })

  it("offers the hustle's own links first, then the template's platforms without repeating a name", () => {
    const platforms = platformsFor({
      type: 'freelancing',
      links: [
        { label: 'Upwork', url: 'https://www.upwork.com/freelancers/~me' },
        { label: 'Portfolio', url: 'https://me.design' },
        { label: 'Bad', url: 'javascript:alert(1)' },
        'not a link',
      ],
    })
    expect(platforms.map((platform) => `${platform.label} ${platform.url}`)).toEqual([
      'Upwork https://www.upwork.com/freelancers/~me',
      'Portfolio https://me.design',
      'Fiverr https://www.fiverr.com/',
      'LinkedIn https://www.linkedin.com/',
    ])
    expect(parseLinks(null)).toEqual([])
  })

  it('turns typed links into web links, and refuses the rest', () => {
    expect(normalizeUrl('upwork.com/freelancers/me')).toBe('https://upwork.com/freelancers/me')
    expect(normalizeUrl(' https://instagram.com/me ')).toBe('https://instagram.com/me')
    expect(normalizeUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeUrl('')).toBeNull()
  })
})

describe('finishing a launch (Demo Mode)', () => {
  it('saves a focus session; done, its minutes count as hustle time', async () => {
    demoDb.insert('hustles', [{ id: 'logos', type: 'freelancing', name: 'Logo design' }])
    await finishLaunch(DEMO, { launch, did: true, now: minutesLater(9) })
    expect(demoDb.list('focus_sessions')).toEqual([
      expect.objectContaining({ id: launch.id, area: 'hustle', hustle_id: 'logos', planned_minutes: 10, actual_minutes: 9, outcome: 'done', completed: true }),
    ])
    expect(demoDb.list('time_entries')).toEqual([expect.objectContaining({ hustle_id: 'logos', minutes: 9, source: 'focus', focus_session_id: launch.id })])

    await finishLaunch(DEMO, { launch: { ...launch, id: '00000000-0000-4000-8000-000000000002' }, did: false, now: minutesLater(30) })
    expect(demoDb.list('focus_sessions').map((session) => session.outcome)).toEqual(['done', 'stopped'])
    expect(demoDb.list('time_entries')).toHaveLength(1)
  })

  it("saves a hustle's own links", async () => {
    demoDb.insert('hustles', [{ id: 'logos', type: 'freelancing', name: 'Logo design' }])
    await saveLinks(DEMO, { hustleId: 'logos', links: [{ label: 'Behance', url: 'https://behance.net/me' }] })
    expect(demoDb.get('hustles', 'logos')?.links).toEqual([{ label: 'Behance', url: 'https://behance.net/me' }])
  })
})
