import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it, vi } from 'vitest'
import { memoryUsage, modelAnswer } from '../_shared/testing.ts'
import { handleStudioNotes, type NoteRow, type NotesStore } from './handler.ts'

const SUBJECT = '11111111-1111-4111-8111-111111111111'
const MATERIAL = '22222222-2222-4222-8222-222222222222'
const VIDEO = 'https://youtu.be/9hE5-98ZeCg?si=abc'
const ENV = { GEMINI_API_KEY: 'gemini-test-key' }
const ANSWER = { title: ' SQL joins ', markdown: '## Inner join\n- Matching rows only\n' }
const request = (source: unknown, extra: Record<string, unknown> = {}) => ({ materialId: MATERIAL, subjectId: SUBJECT, kind: 'notes', title: 'Lecture 4', source, ...extra })

/** The notes table in memory: what was created, and how each note ended. */
function memoryStore() {
  const created: NoteRow[] = []
  const finished: { noteId: string; title: string; content: string; model: string; promptVersion: string }[] = []
  const failed: { noteId: string; error: string }[] = []
  const described: { materialId: string; title: string; durationSec: number }[] = []
  const store: NotesStore = {
    async create(row) {
      created.push(row)
      return `33333333-3333-4333-8333-33333333333${created.length}`
    },
    async finish(noteId, _userId, result) {
      finished.push({ noteId, ...result })
    },
    async fail(noteId, _userId, error) {
      failed.push({ noteId, error })
    },
    async describeVideo(materialId, _userId, details) {
      described.push({ materialId, title: details.title, durationSec: details.durationSec })
    },
  }
  return { store, created, finished, failed, described }
}

/** A fake Gemini that knows YouTube links (like the real provider, it then passes them on instead of downloading them). */
const fakeGemini = (...answers: unknown[]) =>
  new MockLanguageModelV4({
    doGenerate: answers.map((answer) => modelAnswer(JSON.stringify(answer))),
    supportedUrls: { 'video/*': [/^https:\/\/www\.youtube\.com\/watch\?v=/] },
  })

async function call(
  body: unknown,
  {
    env = ENV as Record<string, string>,
    answers = [ANSWER] as unknown[],
    usage = memoryUsage(),
    fetcher,
    model: given,
  }: { env?: Record<string, string>; answers?: unknown[]; usage?: ReturnType<typeof memoryUsage>; fetcher?: typeof fetch; model?: MockLanguageModelV4 } = {},
) {
  const model = given ?? fakeGemini(...answers)
  const notes = memoryStore()
  const tasks: Promise<void>[] = []
  const handler = handleStudioNotes(() => ({ env, authenticate: async () => 'student-1', usage, store: notes.store, background: (task) => tasks.push(task), model: () => model, fetcher }))
  const response = await handler(new Request('http://localhost/studio-notes', { method: 'POST', body: JSON.stringify(body) }))
  await Promise.all(tasks)
  return { response, body: await response.json(), model, notes, usage }
}

const youtube = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
const video = (privacyStatus: string, duration: string) => ({ items: [{ snippet: { title: 'SQL joins in one shot' }, contentDetails: { duration }, status: { privacyStatus } }] })

describe('studio-notes', () => {
  it('saves the note as processing, answers with its id, then fills it in from the text (smart model)', async () => {
    const { response, body, notes, usage, model } = await call(request({ kind: 'text', text: 'Joins combine rows from two tables.' }, { program: 'BTech CSE', year: 1 }))
    expect(response.status).toBe(200)
    expect(body).toEqual({ noteId: '33333333-3333-4333-8333-333333333331' })
    expect(notes.created).toEqual([{ userId: 'student-1', subjectId: SUBJECT, materialId: MATERIAL, kind: 'notes', title: 'Lecture 4', source: 'material' }])
    expect(notes.finished).toEqual([
      { noteId: body.noteId, title: 'SQL joins', content: '## Inner join\n- Matching rows only', model: 'gemini-3.8-flash', promptVersion: 'studio-notes-v1' },
    ])
    expect(usage.logged).toEqual([expect.objectContaining({ feature: 'studio-notes', model: 'gemini-3.8-flash' })])
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(prompt).toContain('Joins combine rows')
    expect(prompt).toContain('BTech CSE, year 1')
  })

  it('gives Gemini the YouTube video by its link, read by the cheaper model', async () => {
    const { body, notes, usage, model } = await call(request({ kind: 'youtube', url: VIDEO }, { kind: 'mind_map' }))
    expect(notes.created[0]).toMatchObject({ kind: 'mind_map', source: 'youtube' })
    expect(notes.finished[0]?.noteId).toBe(body.noteId)
    expect(usage.logged[0]?.model).toBe('gemini-3.5-flash-lite')
    const file = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(file).toContain('"type":"file"')
    expect(file).toContain('https://www.youtube.com/watch?v=9hE5-98ZeCg')
    expect(file).toContain('"mediaType":"video/mp4"')
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain('mind map')
  })

  it("with a YouTube key: refuses private and over-long videos before saving anything, and names a public one's material", async () => {
    const env = { ...ENV, YOUTUBE_API_KEY: 'yt-key' }
    const hidden = await call(request({ kind: 'youtube', url: VIDEO }), { env, fetcher: youtube(video('unlisted', 'PT20M')) })
    expect(hidden.response.status).toBe(422)
    expect(hidden.body).toMatchObject({ code: 'video_not_public' })
    expect(hidden.notes.created).toEqual([])

    const long = await call(request({ kind: 'youtube', url: VIDEO }), { env, fetcher: youtube(video('public', 'PT4H5M')) })
    expect(long.body).toMatchObject({ code: 'video_too_long', message: expect.stringContaining('4 hours') })

    const gone = await call(request({ kind: 'youtube', url: VIDEO }), { env, fetcher: youtube({ items: [] }) })
    expect(gone.body).toMatchObject({ code: 'video_not_found' })

    const ok = await call(request({ kind: 'youtube', url: VIDEO }), { env, fetcher: youtube(video('public', 'PT45M')) })
    expect(ok.response.status).toBe(200)
    expect(ok.notes.described).toEqual([{ materialId: MATERIAL, title: 'SQL joins in one shot', durationSec: 2700 }])

    // When YouTube's API itself fails, the notes are still made (Gemini says if it can't watch the video).
    const down = await call(request({ kind: 'youtube', url: VIDEO }), { env, fetcher: youtube({ error: 'quota' }, 403) })
    expect(down.response.status).toBe(200)
    expect(down.notes.finished).toHaveLength(1)
  })

  it('watches a long lecture at 1 frame every 5 seconds and a short one at every second (the sound always in full)', async () => {
    const env = { ...ENV, YOUTUBE_API_KEY: 'yt-key' }
    const long = await call(request({ kind: 'youtube', url: VIDEO }), { env, fetcher: youtube(video('public', 'PT1H59M15S')) })
    expect(JSON.stringify(long.model.doGenerateCalls[0]?.prompt)).toContain('"videoMetadata":{"fps":0.2}')
    const short = await call(request({ kind: 'youtube', url: VIDEO }), { env, fetcher: youtube(video('public', 'PT12M')) })
    expect(JSON.stringify(short.model.doGenerateCalls[0]?.prompt)).toContain('"videoMetadata":{"fps":1}')
  })

  it('says so when Gemini needed too long to watch the video', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const slow = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      },
      supportedUrls: { 'video/*': [/^https:\/\/www\.youtube\.com\/watch\?v=/] },
    })
    const { body, notes } = await call(request({ kind: 'youtube', url: VIDEO }), { model: slow })
    expect(notes.failed).toEqual([{ noteId: body.noteId, error: expect.stringContaining('more than 2 minutes to watch this video') }])
    quiet.mockRestore()
  })

  it('marks the note as failed, with the reason, when the AI gives no usable answer', async () => {
    const { body, notes } = await call(request({ kind: 'text', text: 'Some notes' }), { answers: [{ wrong: true }, { wrong: true }] })
    expect(notes.finished).toEqual([])
    expect(notes.failed).toEqual([{ noteId: body.noteId, error: expect.stringContaining("didn't have the right shape") }])
  })

  it('answers problems at once and saves no note: no Gemini key, the daily limit, a wrong link', async () => {
    const unset = await call(request({ kind: 'text', text: 'x' }), { env: {} })
    expect(unset.response.status).toBe(500)
    expect(unset.body).toMatchObject({ code: 'not_configured', message: expect.stringContaining('GEMINI_API_KEY') })

    const limit = await call(request({ kind: 'text', text: 'x' }), { usage: memoryUsage({ requests: 150 }) })
    expect(limit.response.status).toBe(429)
    expect(limit.body).toMatchObject({ code: 'daily_limit' })

    const link = await call(request({ kind: 'youtube', url: 'https://vimeo.com/1' }))
    expect(link.response.status).toBe(400)

    for (const result of [unset, limit, link]) expect(result.notes.created).toEqual([])
  })

  it('needs a real material, subject and kind', async () => {
    const { response } = await call({ ...request({ kind: 'text', text: 'x' }), subjectId: 'not-a-uuid', kind: 'essay' })
    expect(response.status).toBe(400)
  })
})
