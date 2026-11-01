import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDemoData, demoProfileRepo } from './localStore'

/** A small stand-in for the browser's localStorage (tests run in Node, which doesn't have one). */
function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => {
      items.delete(key)
    },
    setItem: (key, value) => {
      items.set(key, String(value))
    },
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('demoProfileRepo', () => {
  it('starts with a fresh demo profile that still needs onboarding, and no routine', async () => {
    expect(await demoProfileRepo.getProfile()).toMatchObject({
      id: 'demo-user',
      full_name: 'Demo Student',
      chronotype: 'neutral',
      onboarded_at: null,
    })
    expect(await demoProfileRepo.getRoutine()).toEqual([])
  })

  it('remembers profile changes on this device, but never changes the id', async () => {
    await demoProfileRepo.saveProfile({ id: 'someone-else', full_name: 'Asha', onboarded_at: '2026-11-01T10:00:00Z' })
    expect(await demoProfileRepo.getProfile()).toMatchObject({
      id: 'demo-user',
      full_name: 'Asha',
      onboarded_at: '2026-11-01T10:00:00Z',
    })
  })

  it('replaces the whole routine and fills in the columns the database would', async () => {
    await demoProfileRepo.replaceRoutine([
      { kind: 'class', title: 'Classes', days_of_week: [1], start_time: '09:00', end_time: '16:00' },
    ])
    await demoProfileRepo.replaceRoutine([
      { kind: 'gym', title: 'Gym', days_of_week: [2], start_time: '18:00', end_time: '19:00' },
    ])
    const routine = await demoProfileRepo.getRoutine()
    expect(routine).toHaveLength(1)
    expect(routine[0]).toMatchObject({ kind: 'gym', title: 'Gym', user_id: 'demo-user', valid_from: null, valid_to: null })
  })

  it('starts fresh after clearDemoData, or when the saved data is broken', async () => {
    await demoProfileRepo.saveProfile({ full_name: 'Asha' })
    clearDemoData()
    expect((await demoProfileRepo.getProfile())?.full_name).toBe('Demo Student')

    localStorage.setItem('ekagra-demo-data', '{not json')
    expect((await demoProfileRepo.getProfile())?.full_name).toBe('Demo Student')
  })
})
