import type { LanguageModel } from 'ai'
import type { z } from 'zod'
import { createAiGateway, type AiGateway, type UsageStore } from './ai.ts'
import { AiError, readAiConfig } from './aiCore.ts'

// The HTTP part of every AI function: CORS (so the web app and the Android app may call it),
// the sign-in check, checking the request body with Zod, and errors as { code, message } JSON
// that the app can show as they are.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** One AI feature, e.g. "syllabus → topic tree". */
export interface AiFeature<I, O> {
  /** Saved in ai_usage.feature. */
  feature: string
  /** The shape of the request body. */
  input: z.ZodType<I>
  run(context: { input: I; userId: string; ai: AiGateway }): Promise<O>
}

/** What a request needs from the outside world. Production builds these from Supabase; tests pass fakes. */
export interface ServerDeps {
  env: Record<string, string | undefined>
  /** The signed-in student's id, or null when the request has no valid sign-in. */
  authenticate(request: Request): Promise<string | null>
  usage: UsageStore
  model?: (modelId: string) => LanguageModel
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function handleAiRequest<I, O>(feature: AiFeature<I, O>, deps: () => ServerDeps): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    try {
      if (request.method !== 'POST') throw new AiError(405, 'method_not_allowed', 'Use POST.')
      const { env, authenticate, usage, model } = deps()

      const userId = await authenticate(request)
      if (!userId) throw new AiError(401, 'unauthorized', 'Please sign in again.')

      const body: unknown = await request.json().catch(() => undefined)
      const input = feature.input.safeParse(body)
      if (!input.success) {
        const issue = input.error.issues[0]
        const where = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
        throw new AiError(400, 'bad_request', `The request was not valid (${where}${issue?.message ?? 'unknown problem'}).`)
      }

      const ai = createAiGateway({ config: readAiConfig(env), usage, model })
      return json(await feature.run({ input: input.data, userId, ai }))
    } catch (error) {
      if (error instanceof AiError) return json({ code: error.code, message: error.message }, error.status)
      console.error(error)
      return json({ code: 'server_error', message: 'Something went wrong on the server. Please try again.' }, 500)
    }
  }
}
