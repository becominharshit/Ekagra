import { FunctionsFetchError, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { callAiFunction } from './aiClient'

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
