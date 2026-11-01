import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError, type SupabaseClient } from '@supabase/supabase-js'
import type { z } from 'zod'
import { requireSupabase } from '@/lib/supabase'

// How the app asks the AI: it calls an Edge Function (supabase/functions/<name>) as the signed-in
// student. The function checks the quota, calls the model and logs the cost (_shared/ai.ts).
// In Demo Mode there is no server, so each feature uses its sample answers instead.

/** The AI Edge Functions. */
export type AiFunction = 'ai-syllabus' | 'ai-papers' | 'ai-tutor' | 'ai-generate' | 'ai-capture' | 'ai-brief' | 'ai-hustle' | 'ai-grade'

/** Every Edge Function the app calls: the AI ones, ai-usage (the AI usage dashboard) and account-delete. */
export type EdgeFunction = AiFunction | 'ai-usage' | 'account-delete'

/** The Edge Functions that don't call the AI. */
const NOT_AI = new Set<EdgeFunction>(['ai-usage', 'account-delete'])

/** An AI request that failed. `message` is written for the student. */
export class AiRequestError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AiRequestError'
    this.code = code
  }
}

type FunctionsClient = Pick<SupabaseClient, 'functions'>

/** Calls an Edge Function and checks that the answer has the expected shape. */
export async function callAiFunction<T>(
  name: EdgeFunction,
  body: Record<string, unknown>,
  schema: z.ZodType<T>,
  client: FunctionsClient = requireSupabase(),
): Promise<T> {
  const { data, error } = await client.functions.invoke(name, { body })
  if (error) throw await toAiRequestError(error, name)
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    throw new AiRequestError('invalid_answer', "The AI's answer didn't have the right shape. Please try again.")
  }
  return parsed.data
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.clone().json()
  } catch {
    return null
  }
}

function hasCodeAndMessage(value: unknown): value is { code: string; message: string } {
  if (typeof value !== 'object' || value === null) return false
  const { code, message } = value as Record<string, unknown>
  return typeof code === 'string' && typeof message === 'string'
}

async function toAiRequestError(error: unknown, name: EdgeFunction): Promise<AiRequestError> {
  if (error instanceof FunctionsHttpError) {
    const response: unknown = error.context
    if (!(response instanceof Response)) return new AiRequestError('server_error', 'The AI server sent an error. Please try again.')
    // Our functions never answer 404, so a 404 means the function isn't deployed yet.
    if (response.status === 404) {
      const what = NOT_AI.has(name) ? `The ${name} function isn't` : "The AI features aren't"
      return new AiRequestError('not_deployed', `${what} on the server yet. Deploy the Edge Functions (docs/4-setup-guide.md, step 6).`)
    }
    const body = await readJson(response)
    if (hasCodeAndMessage(body)) return new AiRequestError(body.code, body.message)
    if (response.status === 401) return new AiRequestError('unauthorized', 'Please sign in again.')
    return new AiRequestError('server_error', `The AI server sent an error (${response.status}). Please try again.`)
  }
  if (error instanceof FunctionsFetchError) {
    return new AiRequestError('offline', "Couldn't reach the AI server. Check your internet connection and try again.")
  }
  if (error instanceof FunctionsRelayError) {
    return new AiRequestError('server_error', "The AI server isn't reachable right now. Please try again in a minute.")
  }
  return new AiRequestError('server_error', error instanceof Error ? error.message : 'Something went wrong. Please try again.')
}
