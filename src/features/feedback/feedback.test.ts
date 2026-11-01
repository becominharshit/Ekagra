import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { stubLocalStorage } from '@/test/memoryStorage'
import { listFeedback, sendFeedback, type FeedbackDraft } from './feedback'

// Demo Mode keeps screenshots in IndexedDB, which Node doesn't have: a Map stands in for it.
const deviceFiles = vi.hoisted(() => new Map<string, Blob>())
vi.mock('@/lib/deviceFiles', () => ({
  deviceFiles: {
    put: async (key: string, file: Blob) => {
      deviceFiles.set(key, file)
    },
    get: async (key: string) => deviceFiles.get(key) ?? null,
    remove: async (key: string) => {
      deviceFiles.delete(key)
    },
    clear: async () => deviceFiles.clear(),
  },
}))

stubLocalStorage()

afterEach(() => {
  deviceFiles.clear()
  vi.useRealTimers()
})

const DEMO: DataSource = { kind: 'demo' }
const CONTEXT = { app: 'web', build: '2026-11-01 10:00', viewport: '390×844', browser: 'test', language: 'en-IN', timezone: 'Asia/Kolkata' }

function draft(patch: Partial<FeedbackDraft> = {}): FeedbackDraft {
  return { kind: 'bug', message: '  The timer froze  ', screen: 'Focus', path: '/today/focus', screenshot: null, context: CONTEXT, ...patch }
}

const png = () => new File([new Uint8Array(16)], 'Screenshot_2026.png', { type: 'image/png' })

/** Just enough of the Supabase client for sendFeedback, recording what it was asked to do. */
function fakeSupabase(insertError: { code: string; message: string } | null = null) {
  const calls = { uploads: [] as { bucket: string; path: string; type?: string }[], removed: [] as string[], inserted: [] as Record<string, unknown>[] }
  const client = {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _file: File, options: { contentType?: string }) => {
          calls.uploads.push({ bucket, path, type: options.contentType })
          return { data: { path }, error: null }
        },
        remove: async (paths: string[]) => {
          calls.removed.push(...paths.map((path) => `${bucket}/${path}`))
          return { data: [], error: null }
        },
      }),
    },
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        calls.inserted.push({ table, ...row })
        return {
          select: () => ({
            single: async () => (insertError ? { data: null, error: { details: '', hint: '', ...insertError } } : { data: { ...row, status: 'new' }, error: null }),
          }),
        }
      },
    }),
  }
  return { source: { kind: 'supabase', userId: 'user-1', client } as unknown as DataSource, calls }
}

describe('feedback in Demo Mode', () => {
  it('keeps the feedback and its screenshot on this device', async () => {
    const saved = await sendFeedback(DEMO, draft({ screenshot: png() }))
    expect(saved).toMatchObject({ kind: 'bug', message: 'The timer froze', screen: 'Focus', path: '/today/focus', context: CONTEXT, status: 'new' })
    expect(saved.screenshot_path).toBe(`device:feedback/${saved.id}`)
    expect(deviceFiles.get(`feedback/${saved.id}`)).toBeInstanceOf(Blob)
    expect(await listFeedback(DEMO)).toEqual([saved])
  })

  it('saves no screenshot path without a screenshot, and an empty screen name as none', async () => {
    const saved = await sendFeedback(DEMO, draft({ screen: '  ' }))
    expect(saved.screenshot_path).toBeNull()
    expect(saved.screen).toBeNull()
    expect(deviceFiles.size).toBe(0)
  })

  it('lists the newest first', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-01T08:00:00Z'))
    await sendFeedback(DEMO, draft({ message: 'First' }))
    vi.setSystemTime(new Date('2026-11-01T09:00:00Z'))
    await sendFeedback(DEMO, draft({ message: 'Second' }))
    expect((await listFeedback(DEMO)).map((item) => item.message)).toEqual(['Second', 'First'])
  })

  it('refuses an empty message or an unsupported image, and saves nothing', async () => {
    await expect(sendFeedback(DEMO, draft({ message: '   ' }))).rejects.toThrow(/Write a few words/)
    await expect(sendFeedback(DEMO, draft({ screenshot: new File(['gif'], 'a.gif', { type: 'image/gif' }) }))).rejects.toThrow(/PNG, JPG or WebP/)
    expect(await listFeedback(DEMO)).toEqual([])
  })
})

describe('feedback when signed in', () => {
  it("uploads the screenshot to the student's folder in the images bucket, then saves the row", async () => {
    const { source, calls } = fakeSupabase()
    const saved = await sendFeedback(source, draft({ screenshot: png() }))
    const path = `user-1/feedback/${saved.id}.png`
    expect(calls.uploads).toEqual([{ bucket: 'images', path, type: 'image/png' }])
    expect(calls.inserted).toEqual([
      { table: 'feedback', id: saved.id, kind: 'bug', message: 'The timer froze', screen: 'Focus', path: '/today/focus', context: CONTEXT, screenshot_path: path },
    ])
  })

  it('sends feedback without a screenshot', async () => {
    const { source, calls } = fakeSupabase()
    await sendFeedback(source, draft())
    expect(calls.uploads).toEqual([])
    expect(calls.inserted[0]).toMatchObject({ screenshot_path: null })
  })

  it("removes the screenshot again when the row can't be saved, and explains a missing table", async () => {
    const { source, calls } = fakeSupabase({ code: 'PGRST205', message: "Could not find the table 'public.feedback' in the schema cache" })
    await expect(sendFeedback(source, draft({ screenshot: png() }))).rejects.toThrow(/needs the latest update/)
    expect(calls.removed).toEqual([`images/${calls.uploads[0]?.path}`])
  })
})
