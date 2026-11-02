import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { addYoutubeLink, listLibrary, materialText, moveMaterial, renameMaterial } from './library'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const youtube = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe("Studio's library", () => {
  it('lists study materials of every kind, newest first, but not syllabi or past papers', async () => {
    demoDb.insert('materials', [
      { kind: 'pdf', title: 'Old notes', created_at: '2026-11-01T10:00:00.000Z' },
      { kind: 'image', title: 'Whiteboard', created_at: '2026-11-02T10:00:00.000Z' },
      { kind: 'pdf', purpose: 'syllabus', title: 'DBMS syllabus' },
      { kind: 'text', title: 'Typed notes', created_at: '2026-11-01T12:00:00.000Z' },
    ])
    expect((await listLibrary(DEMO)).map((material) => material.title)).toEqual(['Whiteboard', 'Typed notes', 'Old notes'])
  })

  it('adds a YouTube video by its link, with its title from YouTube', async () => {
    const { material, foundTitle } = await addYoutubeLink(DEMO, { link: 'https://youtu.be/9hE5-98ZeCg?si=x', subjectId: null, fetcher: youtube(200, { title: 'SQL joins' }) })
    expect(material).toMatchObject({ kind: 'youtube', purpose: 'study', title: 'SQL joins', source_url: 'https://www.youtube.com/watch?v=9hE5-98ZeCg' })
    expect(foundTitle).toBe(true)
  })

  it("keeps the student's own title, or a plain one when YouTube can't see the video", async () => {
    const own = await addYoutubeLink(DEMO, { link: 'youtube.com/shorts/9hE5-98ZeCg', subjectId: null, title: ' Joins in 60 seconds ', fetcher: youtube(200, { title: 'x' }) })
    expect(own.material.title).toBe('Joins in 60 seconds')
    const hidden = await addYoutubeLink(DEMO, { link: 'https://www.youtube.com/watch?v=9hE5-98ZeCg', subjectId: null, fetcher: youtube(401, 'Unauthorized') })
    expect(hidden).toMatchObject({ foundTitle: false, material: { title: 'YouTube video' } })
  })

  it("refuses a link that isn't a YouTube video", async () => {
    await expect(addYoutubeLink(DEMO, { link: 'https://vimeo.com/1', subjectId: null })).rejects.toThrow(/isn't a link to a YouTube video/)
  })

  it('moves and renames a material, and reads the text of a text material', async () => {
    const [subject] = demoDb.insert('subjects', [{ name: 'DBMS' }])
    const [material] = demoDb.insert('materials', [{ kind: 'text', title: 'Notes' }])
    if (!subject || !material) throw new Error('No rows')
    demoDb.insert('material_pages', [{ material_id: material.id, page_no: 1, text: 'Joins: inner and outer.' }])

    await moveMaterial(DEMO, { id: material.id, subjectId: subject.id })
    await renameMaterial(DEMO, { id: material.id, title: '  Joins  ' })
    expect(demoDb.get('materials', material.id)).toMatchObject({ subject_id: subject.id, title: 'Joins' })
    await expect(renameMaterial(DEMO, { id: material.id, title: ' ' })).rejects.toThrow(/Give it a name/)
    expect(await materialText(DEMO, material.id)).toBe('Joins: inner and outer.')
  })
})
