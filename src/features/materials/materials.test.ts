import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import type { Tables } from '@/types/database'
import { addPhotoMaterial, addTextMaterial, deleteMaterial } from './materials'

// Demo Mode keeps files in IndexedDB, which Node doesn't have: a Map stands in for it.
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
})

const DEMO: DataSource = { kind: 'demo' }
const PHOTO = { mimeType: 'image/jpeg' as const, base64: btoa('jpeg bytes') }

/** Just enough of the Supabase client for these functions, recording what it was asked to do. */
function fakeSupabase({ failInsertInto = null as string | null } = {}) {
  const calls = { uploads: [] as { bucket: string; path: string; type?: string }[], removed: [] as string[], inserted: [] as Record<string, unknown>[], deleted: [] as string[] }
  const client = {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _file: Blob, options: { contentType?: string }) => {
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
        const result = failInsertInto === table ? { data: null, error: { code: '23514', message: `${table} said no`, details: '', hint: '' } } : { data: row, error: null }
        // Awaited directly (material_pages) or through .select().single() (materials).
        return { select: () => ({ single: async () => result }), then: (resolve: (value: typeof result) => unknown) => resolve(result) }
      },
      delete: () => ({
        eq: async (_column: string, id: string) => {
          calls.deleted.push(`${table}/${id}`)
          return { error: null }
        },
      }),
    }),
  }
  return { source: { kind: 'supabase', userId: 'user-1', client } as unknown as DataSource, calls }
}

describe('study material from the Add inbox, in Demo Mode', () => {
  it('keeps a photo on this device with its row', async () => {
    const saved = await addPhotoMaterial(DEMO, { photo: PHOTO, subjectId: null, title: ' Whiteboard, Unit 2 ' })
    expect(saved).toMatchObject({ kind: 'image', purpose: 'study', title: 'Whiteboard, Unit 2', storage_path: `device:${saved.id}`, status: 'ready' })
    expect(await deviceFiles.get(saved.id)?.text()).toBe('jpeg bytes')
  })

  it('keeps text as a material with one page, and refuses empty text', async () => {
    const saved = await addTextMaterial(DEMO, { text: '  Normal forms: 1NF, 2NF, 3NF  ', subjectId: null, title: '' })
    expect(saved).toMatchObject({ kind: 'text', title: 'Notes', page_count: 1 })
    expect(demoDb.list('material_pages')).toEqual([expect.objectContaining({ material_id: saved.id, page_no: 1, text: 'Normal forms: 1NF, 2NF, 3NF' })])
    await expect(addTextMaterial(DEMO, { text: '   ', subjectId: null, title: 'x' })).rejects.toThrow(/no text/)
  })
})

describe('study material from the Add inbox, signed in', () => {
  it("uploads a photo to the student's folder in the images bucket, then saves its row", async () => {
    const { source, calls } = fakeSupabase()
    const saved = await addPhotoMaterial(source, { photo: PHOTO, subjectId: 'subject-1', title: 'Board' })
    expect(calls.uploads).toEqual([{ bucket: 'images', path: `user-1/materials/${saved.id}.jpg`, type: 'image/jpeg' }])
    expect(calls.inserted).toEqual([expect.objectContaining({ table: 'materials', kind: 'image', subject_id: 'subject-1', storage_path: `user-1/materials/${saved.id}.jpg` })])
  })

  it("removes the uploaded photo when its row can't be saved", async () => {
    const { source, calls } = fakeSupabase({ failInsertInto: 'materials' })
    await expect(addPhotoMaterial(source, { photo: PHOTO, subjectId: null, title: 'Board' })).rejects.toThrow('materials said no')
    expect(calls.removed).toEqual([calls.uploads[0] && `images/${calls.uploads[0].path}`])
  })

  it("saves text as a material and its page; without the page, the material goes too", async () => {
    const ok = fakeSupabase()
    const saved = await addTextMaterial(ok.source, { text: 'SQL joins', subjectId: null, title: 'Joins' })
    expect(ok.calls.inserted.map((row) => row.table)).toEqual(['materials', 'material_pages'])
    expect(ok.calls.inserted[1]).toMatchObject({ material_id: saved.id, page_no: 1, text: 'SQL joins' })

    const broken = fakeSupabase({ failInsertInto: 'material_pages' })
    await expect(addTextMaterial(broken.source, { text: 'SQL joins', subjectId: null, title: 'Joins' })).rejects.toThrow('material_pages said no')
    expect(broken.calls.deleted).toEqual([`materials/${broken.calls.inserted[0]?.id}`])
  })

  it('deletes the file from the right bucket: photos from images, PDFs from materials', async () => {
    const { source, calls } = fakeSupabase()
    const material = (kind: string, path: string) => ({ id: `${kind}-1`, kind, storage_path: path }) as Tables<'materials'>
    await deleteMaterial(source, material('image', 'user-1/materials/a.jpg'))
    await deleteMaterial(source, material('pdf', 'user-1/b.pdf'))
    expect(calls.removed).toEqual(['images/user-1/materials/a.jpg', 'materials/user-1/b.pdf'])
  })
})
