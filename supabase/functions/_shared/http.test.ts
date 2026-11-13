import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { handleAiRequest, type AiFeature, type ServerDeps } from './http.ts'
import { fakeModel, memoryUsage, modelAnswer, TEST_SECRETS } from './testing.ts'

// A tiny feature: "give me one topic for this subject".
const oneTopic: AiFeature<{ subject: string }, { topic: string }> = {
  feature: 'test',
  input: z.object({ subject: z.string().min(1) }),
  async run({ input, userId, ai }) {
    const { data } = await ai.generate({
      userId,
      feature: 'test',
      tier: 'fast',
      schema: z.object({ topic: z.string() }),
      instructions: 'Name one topic.',
      prompt: input.subject,
    })
    return data
  },
}

function deps(overrides: Partial<ServerDeps> = {}): () => ServerDeps {
  return () => ({
    env: TEST_SECRETS,
    authenticate: async (request) => (request.headers.get('Authorization') === 'Bearer good-token' ? 'student-1' : null),
    usage: memoryUsage(),
    model: () => fakeModel(modelAnswer('{"topic":"Joins"}')),
    ...overrides,
  })
}

function post(body: unknown, token = 'good-token', origin = 'https://ekagra.app'): Request {
  return new Request('http://localhost/functions/v1/ai-test', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('handleAiRequest', () => {
  it('answers browser preflight (CORS) strictly from ALLOWED_ORIGINS allowlist', async () => {
    const allowed = await handleAiRequest(oneTopic, deps())(
      new Request('http://localhost/x', { method: 'OPTIONS', headers: { Origin: 'https://ekagra.app' } }),
    )
    expect(allowed.status).toBe(200)
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://ekagra.app')

    const capacitor = await handleAiRequest(oneTopic, deps())(
      new Request('http://localhost/x', { method: 'OPTIONS', headers: { Origin: 'capacitor://localhost' } }),
    )
    expect(capacitor.status).toBe(200)
    expect(capacitor.headers.get('Access-Control-Allow-Origin')).toBe('capacitor://localhost')

    const custom = await handleAiRequest(oneTopic, deps({ env: { ...TEST_SECRETS, ALLOWED_ORIGINS: 'https://campus.example.edu' } }))(
      new Request('http://localhost/x', { method: 'OPTIONS', headers: { Origin: 'https://campus.example.edu' } }),
    )
    expect(custom.status).toBe(200)
    expect(custom.headers.get('Access-Control-Allow-Origin')).toBe('https://campus.example.edu')

    const blocked = await handleAiRequest(oneTopic, deps())(
      new Request('http://localhost/x', { method: 'OPTIONS', headers: { Origin: 'https://evil.example.com' } }),
    )
    expect(blocked.status).toBe(403)
    expect(blocked.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it("returns the feature's answer as JSON with matched origin CORS", async () => {
    const response = await handleAiRequest(oneTopic, deps())(post({ subject: 'DBMS' }))
    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://ekagra.app')
    expect(await response.json()).toEqual({ topic: 'Joins' })
  })

  it('turns away requests without a valid sign-in', async () => {
    const response = await handleAiRequest(oneTopic, deps())(post({ subject: 'DBMS' }, 'stolen-token'))
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: 'unauthorized' })
  })

  it('says which part of the request body is wrong', async () => {
    const response = await handleAiRequest(oneTopic, deps())(post({ subject: '' }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'bad_request', message: expect.stringContaining('subject') })
  })

  it('only accepts POST', async () => {
    const response = await handleAiRequest(oneTopic, deps())(new Request('http://localhost/x', { method: 'GET' }))
    expect(response.status).toBe(405)
  })

  it('explains when the AI secrets are not set yet', async () => {
    const response = await handleAiRequest(oneTopic, deps({ env: {} }))(post({ subject: 'DBMS' }))
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ code: 'not_configured', message: expect.stringContaining('AI_API_KEY') })
  })

  it('passes quota stops on with their status and message', async () => {
    const response = await handleAiRequest(oneTopic, deps({ usage: memoryUsage({ requests: 1000 }) }))(post({ subject: 'DBMS' }))
    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({ code: 'daily_limit' })
  })

  it('hides the details of unexpected errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const crashing: AiFeature<{ subject: string }, never> = {
      ...oneTopic,
      run: async () => {
        throw new Error('database password is hunter2')
      },
    }
    const response = await handleAiRequest(crashing, deps())(post({ subject: 'DBMS' }))
    expect(response.status).toBe(500)
    const body: { code: string; message: string } = await response.json()
    expect(body.code).toBe('server_error')
    expect(body.message).not.toContain('hunter2')
  })
})
