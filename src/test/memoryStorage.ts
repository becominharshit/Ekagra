import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'

/** A small stand-in for the browser's localStorage (tests run in Node, which doesn't have one). */
export function memoryStorage(): Storage {
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

/**
 * Gives the tests an empty localStorage: a new one for every test ('each'),
 * or one shared by all tests in the file ('file') when they build on each other.
 */
export function stubLocalStorage(scope: 'each' | 'file' = 'each'): void {
  const before = scope === 'each' ? beforeEach : beforeAll
  const after = scope === 'each' ? afterEach : afterAll
  before(() => {
    vi.stubGlobal('localStorage', memoryStorage())
  })
  after(() => {
    vi.unstubAllGlobals()
  })
}
