import { FunctionsFetchError, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { callAiFunction, streamAiFunction } from './aiClient'

const schema = z.object({ topic: z.string() })

/** A pretend Supabase client whose function call gives back `result`. */
function client(result: { data: unknown; error: unknown }): Pick<SupabaseClient, 'functions'> {
  return { functions: { invoke: vi.fn().mockResolvedValue(result) } } as unknown as Pick<SupabaseClient, 'functions'>
}

function httpError(status: number, body: unknown): FunctionsHttpError {
  return new FunctionsHttpError(new Response(JSON.stringify(body), { status }))
}

describe('callAiFunction', () => {
  it('sends the body and returns the checked answer', async () => {
    const fake = client({ data: { topic: 'Joins' }, error: null })
    await expect(callAiFunction('ai-syllabus', { text: 'DBMS' }, schema, fake)).resolves.toEqual({ topic: 'Joins' })
    expect(fake.functions.invoke).toHaveBeenCalledWith('ai-syllabus', { body: { text: 'DBMS' } })
  })

  it('rejects an answer with the wrong shape', async () => {
    const fake = client({ data: { topics: [] }, error: null })
    await expect(callAiFunction('ai-syllabus', {}, schema, fake)).rejects.toMatchObject({ code: 'invalid_answer' })
  })

  it("shows the server's own message, e.g. when the daily limit is reached", async () => {
    const fake = client({ data: null, error: httpError(429, { code: 'daily_limit', message: 'You used your 150 AI requests.' }) })
    await expect(callAiFunction('ai-syllabus', {}, schema, fake)).rejects.toMatchObject({
      code: 'daily_limit',
      message: 'You used your 150 AI requests.',
    })
  })

  it('explains a missing function (not deployed yet)', async () => {
    const fake = client({ data: null, error: httpError(404, { code: 'NOT_FOUND', message: 'Requested function was not found' }) })
    await expect(callAiFunction('ai-tutor', {}, schema, fake)).rejects.toMatchObject({ code: 'not_deployed' })
  })

  it('asks to sign in again after a 401 without our message', async () => {
    const fake = client({ data: null, error: httpError(401, { msg: 'Invalid JWT' }) })
    await expect(callAiFunction('ai-tutor', {}, schema, fake)).rejects.toMatchObject({ code: 'unauthorized' })
  })

  it('explains being offline', async () => {
    const fake = client({ data: null, error: new FunctionsFetchError(new TypeError('Failed to fetch')) })
    await expect(callAiFunction('ai-tutor', {}, schema, fake)).rejects.toMatchObject({ code: 'offline' })
  })
})

describe('streamAiFunction', () => {
  it('decodes fragmented SSE deltas, status events, and final validated payload', async () => {
    const encoder = new TextEncoder()
    const payload = [
      'event: status\ndata: {"stage":"streaming"}\n\n',
      'event: delta\ndata: {"answerMd":"BCNF"}\n\n',
      'event: delta\ndata: {"answerMd":"BCNF means superkey [p. 12]."}\n\n',
      'event: done\ndata: {"topic":"Joins"}\n\n',
    ].join('')
    // Split at awkward byte boundaries to verify incremental buffering
    const chunks = [payload.slice(0, 27), payload.slice(27, 81), payload.slice(81)]
    const fetcher = vi.fn(async () => {
      let i = 0
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (i < chunks.length) controller.enqueue(encoder.encode(chunks[i++]!))
          else controller.close()
        },
      })
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    })

    const statuses: unknown[] = []
    const deltas: unknown[] = []
    const result = await streamAiFunction('ai-tutor', { action: 'explain' }, {
      schema,
      endpointUrl: 'https://example.test/functions/v1/ai-tutor',
      tokenGetter: async () => 'jwt-token',
      fetcher: fetcher as unknown as typeof fetch,
      onStatus: (s) => statuses.push(s),
      onDelta: (d) => deltas.push(d),
    })

    expect(result).toEqual({ topic: 'Joins' })
    expect(statuses).toEqual([{ stage: 'streaming' }])
    expect(deltas).toEqual([{ answerMd: 'BCNF' }, { answerMd: 'BCNF means superkey [p. 12].' }])
  })

  it('retries transient 503/429 errors with exponential backoff before streaming succeeds', async () => {
    const encoder = new TextEncoder()
    let calls = 0
    const waits: number[] = []
    const fetcher = vi.fn(async () => {
      calls += 1
      if (calls === 1) return new Response(JSON.stringify({ code: 'provider_busy', message: 'Busy' }), { status: 503 })
      if (calls === 2) return new Response(JSON.stringify({ code: 'rate_limited', message: 'Slow down' }), { status: 429 })
      return new Response(encoder.encode('event: done\ndata: {"topic":"3NF"}\n\n'), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    })

    const out = await streamAiFunction('studio-notes', {}, {
      schema,
      endpointUrl: 'https://example.test/functions/v1/studio-notes',
      tokenGetter: async () => 'jwt',
      fetcher: fetcher as unknown as typeof fetch,
      sleep: async (ms) => {
        waits.push(ms)
      },
    })
    expect(out).toEqual({ topic: '3NF' })
    expect(calls).toBe(3)
    expect(waits).toEqual([1000, 2000])
  })

  it('does not retry billing quota 429 errors and surfaces the server message', async () => {
    const waits: number[] = []
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ code: 'daily_limit', message: 'Free daily cap reached.' }), { status: 429 }),
    )
    await expect(
      streamAiFunction('ai-tutor', {}, {
        schema,
        endpointUrl: 'https://example.test/functions/v1/ai-tutor',
        tokenGetter: async () => 'jwt',
        fetcher: fetcher as unknown as typeof fetch,
        sleep: async (ms) => {
          waits.push(ms)
        },
      }),
    ).rejects.toMatchObject({ code: 'daily_limit', message: 'Free daily cap reached.' })
    expect(waits).toEqual([])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
