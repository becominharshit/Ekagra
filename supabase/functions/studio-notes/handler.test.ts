import { APICallError } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it, vi } from 'vitest'
import { memoryUsage, modelAnswer } from '../_shared/testing.ts'
import { handleStudioNotes, joinParts, type NoteRow, type NotesStore } from './handler.ts'

const SUBJECT = '11111111-1111-4111-8111-111111111111'
const MATERIAL = '22222222-2222-4222-8222-222222222222'
const VIDEO = 'https://youtu.be/9hE5-98ZeCg?si=abc'
const ENV = { GEMINI_API_KEY: 'gemini-test-key' }
const ANSWER = { title: ' SQL joins ', markdown: '## Inner join\n- Matching rows only\n' }
const request = (source: unknown, extra: Record<string, unknown> = {}) => ({ materialId: MATERIAL, subjectId: SUBJECT, kind: 'notes', title: 'Lecture 4', source, ...extra })

/** The notes table in memory: what was created, and how each note ended. `notesOfVideo`: finished notes already made from the material. */
function memoryStore(notesOfVideo: string | null = null) {
  const created: NoteRow[] = []
  const finished: { noteId: string; title: string; content: string; model: string; promptVersion: string }[] = []
  const failed: { noteId: string; error: string }[] = []
  const described: { materialId: string; title: string; durationSec: number }[] = []
  const store: NotesStore = {
    async readyNotes() {
      return notesOfVideo
    },
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
    notesOfVideo = null,
  }: { env?: Record<string, string>; answers?: unknown[]; usage?: ReturnType<typeof memoryUsage>; fetcher?: typeof fetch; model?: MockLanguageModelV4; notesOfVideo?: string | null } = {},
) {
  const model = given ?? fakeGemini(...answers)
  const notes = memoryStore(notesOfVideo)
  const tasks: Promise<void>[] = []
  const waits: number[] = []
  const handler = handleStudioNotes(() => ({
    env,
    authenticate: async () => 'student-1',
    usage,
    store: notes.store,
    background: (task) => tasks.push(task),
    model: () => model,
    fetcher,
    sleep: async (ms) => {
      waits.push(ms)
    },
  }))
  const response = await handler(new Request('http://localhost/studio-notes', { method: 'POST', body: JSON.stringify(body) }))
  await Promise.all(tasks)
  return { response, body: await response.json(), model, notes, usage, waits }
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
      { noteId: body.noteId, title: 'SQL joins', content: '## Inner join\n- Matching rows only', model: 'gemini-3.8-flash', promptVersion: 'studio-notes-v4' },
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

    const ok = await call(request({ kind: 'youtube', url: VIDEO }), { env, fetcher: youtube(video('public', 'PT25M')) })
    expect(ok.response.status).toBe(200)
    expect(ok.notes.described).toEqual([{ materialId: MATERIAL, title: 'SQL joins in one shot', durationSec: 1500 }])

    // When YouTube's API itself fails, the notes are still made (Gemini says if it can't watch the video).
    const down = await call(request({ kind: 'youtube', url: VIDEO }), { env, fetcher: youtube({ error: 'quota' }, 403) })
    expect(down.response.status).toBe(200)
    expect(down.notes.finished).toHaveLength(1)
  })

  it('watches a lecture over 20 minutes at 1 frame every 5 seconds and a short one at every second (the sound always in full)', async () => {
    const env = { ...ENV, YOUTUBE_API_KEY: 'yt-key' }
    // A 25-minute video's full notes are two 12:30 parts: each is seen at 0.2 frames a second, from its own offset.
    const part = (n: number) => ({ summary: `Part ${n} teaches topic ${n}.`, markdown: `## Topic ${n}\n- Point ${n}`, keyPoints: [`Fact ${n}`] })
    const longer = await call(request({ kind: 'youtube', url: VIDEO }), { env, fetcher: youtube(video('public', 'PT25M')), answers: [part(1), part(2)] })
    const longerPrompts = longer.model.doGenerateCalls.map((called) => JSON.stringify(called.prompt))
    expect(longerPrompts).toHaveLength(2)
    for (const prompt of longerPrompts) expect(prompt).toContain('"fps":0.2')
    expect(longerPrompts.some((prompt) => prompt.includes('"startOffset":"750s","endOffset":"1500s"'))).toBe(true)
    const short = await call(request({ kind: 'youtube', url: VIDEO }), { env, fetcher: youtube(video('public', 'PT12M')) })
    expect(JSON.stringify(short.model.doGenerateCalls[0]?.prompt)).toContain('"videoMetadata":{"fps":1}')
  })

  it('makes full notes of a lecture over 30 minutes from its parts, watched at the same time and joined in order (no more requests)', async () => {
    const env = { ...ENV, YOUTUBE_API_KEY: 'yt-key' }
    const pieces = Array.from({ length: 8 }, (_, index) => {
      const n = index + 1
      return { summary: `Part ${n} teaches topic ${n}.`, markdown: `## Topic ${n} (${n}:00)\n- Point ${n}`, keyPoints: [`Fact ${n}`] }
    })
    const { notes, model, usage } = await call(request({ kind: 'youtube', url: VIDEO }), { env, fetcher: youtube(video('public', 'PT1H59M15S')), answers: pieces })

    expect(model.doGenerateCalls).toHaveLength(8)
    const asked = model.doGenerateCalls.map((part) => JSON.stringify(part.prompt))
    // 7,155 seconds in 8 equal parts of 895 seconds (the last one shorter), each a clip of the video.
    const clips = ['0s', '895s', '1790s', '2685s', '3580s', '4475s', '5370s', '6265s', '7155s']
    for (let index = 0; index < clips.length - 1; index += 1) {
      expect(asked.some((prompt) => prompt.includes(`"startOffset":"${clips[index]}","endOffset":"${clips[index + 1]}"`))).toBe(true)
    }
    expect(asked.some((prompt) => prompt.includes('This is part 1 of 8 of the video, from 0:00 to 14:55'))).toBe(true)
    expect(asked[0]).toContain('one part of a long lecture video')
    const [note] = notes.finished
    expect(note).toMatchObject({ title: 'Lecture 4', model: 'gemini-3.5-flash-lite', promptVersion: 'studio-notes-v4' })
    expect(note?.content).toContain('- **1:44:25–1:59:15:** Part 8 teaches topic 8.')
    expect(note?.content.indexOf('## Topic 1 (1:00)')).toBeLessThan(note?.content.indexOf('## Topic 8 (8:00)') ?? 0)
    expect(note?.content).toMatch(/## Key points\n\n- Fact 1\n- Fact 2\n- Fact 3\n- Fact 4\n- Fact 5\n- Fact 6\n- Fact 7\n- Fact 8$/)
    expect(usage.logged).toHaveLength(8)
  })

  it("makes a mind map of a lecture over 30 minutes from its parts' maps, combined by one more request", async () => {
    const env = { ...ENV, YOUTUBE_API_KEY: 'yt-key' }
    const pieces = [1, 2, 3, 4].map((n) => ({ title: `Part ${n}`, markdown: `## Topic ${n}\n- Point ${n}` }))
    const whole = { title: 'Electromagnetic waves', markdown: '# EM waves\n## Topic 1\n- Point 1\n## Topic 4\n- Point 4' }
    const { notes, model, usage } = await call(request({ kind: 'youtube', url: VIDEO }, { kind: 'mind_map' }), {
      env,
      fetcher: youtube(video('public', 'PT1H59M15S')),
      answers: [...pieces, whole],
    })

    expect(model.doGenerateCalls).toHaveLength(5)
    const combine = JSON.stringify(model.doGenerateCalls[4]?.prompt)
    expect(combine).toContain('Part 4, 1:29:27 to 1:59:15')
    for (const piece of pieces) expect(combine).toContain(JSON.stringify(piece.markdown).slice(1, -1))
    expect(combine).not.toContain('"type":"file"')
    expect(notes.finished).toEqual([expect.objectContaining({ title: 'Electromagnetic waves', content: whole.markdown, model: 'gemini-3.5-flash-lite' })])
    expect(usage.logged).toHaveLength(5)
  })

  it("waits for the next minute when combining is over Gemini's free tier tokens for this one", async () => {
    const env = { ...ENV, YOUTUBE_API_KEY: 'yt-key' }
    const quiet = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const overLimit = new APICallError({
      message: 'You exceeded your current quota',
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
      requestBodyValues: {},
      statusCode: 429,
      responseBody: JSON.stringify({
        error: {
          code: 429,
          status: 'RESOURCE_EXHAUSTED',
          message: 'Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_input_token_count, limit: 250000',
          details: [
            { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateContentInputTokensPerModelPerMinute-FreeTier', quotaValue: '250000' }] },
            { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '13s' },
          ],
        },
      }),
      isRetryable: true,
    })
    const answers = [1, 2, 3, 4].map((n) => modelAnswer(JSON.stringify({ title: `Part ${n}`, markdown: `## Topic ${n}` })))
    let calls = 0
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        calls += 1
        if (calls <= 4) return answers[calls - 1] ?? modelAnswer('{}')
        if (calls === 5) throw overLimit
        return modelAnswer(JSON.stringify({ title: 'EM waves', markdown: '## Formulas\n- c' }))
      },
      supportedUrls: { 'video/*': [/^https:\/\/www\.youtube\.com\/watch\?v=/] },
    })
    const { notes, waits } = await call(request({ kind: 'youtube', url: VIDEO }, { kind: 'revision_sheet' }), { env, fetcher: youtube(video('public', 'PT1H59M15S')), model })

    expect(waits).toEqual([14_000])
    expect(calls).toBe(6)
    expect(notes.finished).toEqual([expect.objectContaining({ title: 'EM waves', content: '## Formulas\n- c' })])
    quiet.mockRestore()
  })

  it('makes a mind map or revision sheet of a video from the notes already made from it, without watching it again', async () => {
    const env = { ...ENV, YOUTUBE_API_KEY: 'yt-key' }
    const looked = vi.fn(youtube(video('public', 'PT1H59M15S')))
    const map = { title: 'EM waves', markdown: '# EM waves\n## Maxwell\n- Displacement current' }
    const { notes, model } = await call(request({ kind: 'youtube', url: VIDEO }, { kind: 'mind_map' }), {
      env,
      fetcher: looked as unknown as typeof fetch,
      answers: [map],
      notesOfVideo: '## Displacement current (1:48)\n- A changing electric field acts like a current.',
    })

    expect(model.doGenerateCalls).toHaveLength(1)
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(prompt).toContain('A changing electric field acts like a current.')
    expect(prompt).toContain('here are the full notes made from it')
    expect(prompt).not.toContain('"type":"file"')
    expect(looked).not.toHaveBeenCalled()
    expect(notes.created[0]).toMatchObject({ kind: 'mind_map', source: 'youtube' })
    expect(notes.finished).toEqual([expect.objectContaining({ title: 'EM waves', content: map.markdown, model: 'gemini-3.5-flash-lite' })])
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
    expect(notes.failed).toEqual([{ noteId: body.noteId, error: expect.stringContaining('needed too long to watch this video') }])
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

describe('joining the parts of a long lecture', () => {
  it("keeps every part's notes in order, drops their own titles and key points sections, and lists each key point once", () => {
    const joined = joinParts([
      { start: 0, end: 1789, summary: 'Displacement current.\n', markdown: '# EM waves\n## Displacement current (1:48)\n- i_d', keyPoints: ['Maxwell fixed Ampere’s law', '- Speed c'] },
      {
        start: 1789,
        end: 3578,
        summary: 'Maxwell’s equations and the speed of light.',
        markdown: '## Maxwell’s equations (30:10)\n- Four laws\n## Key points\n- Repeated here\n## Speed of light (45:00)\n- c = 1/√(μ₀ε₀)',
        keyPoints: ['speed c', 'Four laws'],
      },
    ])
    expect(joined).toBe(
      [
        '## Overview',
        '- **0:00–29:49:** Displacement current.\n- **29:49–59:38:** Maxwell’s equations and the speed of light.',
        '## Displacement current (1:48)\n- i_d',
        '## Maxwell’s equations (30:10)\n- Four laws\n## Speed of light (45:00)\n- c = 1/√(μ₀ε₀)',
        '## Key points',
        '- Maxwell fixed Ampere’s law\n- Speed c\n- Four laws',
      ].join('\n\n'),
    )
  })
})
