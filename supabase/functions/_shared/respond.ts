import type { z } from 'zod'
import { AiError } from './aiCore.ts'

// The HTTP part every Edge Function shares: CORS (so the web app and the Android app may call it),
// POST only, checking the request body with Zod, and errors as { code, message } JSON that the app
// can show as they are. No AI code in here, so functions that don't call the AI stay small.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Turns `run` into a request handler: CORS preflight, POST only, the answer as JSON, errors as { code, message }. */
export function handleJson(run: (request: Request) => Promise<unknown>): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    try {
      if (request.method !== 'POST') throw new AiError(405, 'method_not_allowed', 'Use POST.')
      return json(await run(request))
    } catch (error) {
      if (error instanceof AiError) return json({ code: error.code, message: error.message }, error.status)
      console.error(error)
      return json({ code: 'server_error', message: 'Something went wrong on the server. Please try again.' }, 500)
    }
  }
}

/** The request body, checked with the schema. A wrong body is a 400 that names the wrong field. */
export async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const body: unknown = await request.json().catch(() => undefined)
  const input = schema.safeParse(body)
  if (!input.success) {
    const issue = input.error.issues[0]
    const where = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
    throw new AiError(400, 'bad_request', `The request was not valid (${where}${issue?.message ?? 'unknown problem'}).`)
  }
  return input.data
}

/** The signed-in student's id, or a 401. */
export async function requireUser(authenticate: (request: Request) => Promise<string | null>, request: Request): Promise<string> {
  const userId = await authenticate(request)
  if (!userId) throw new AiError(401, 'unauthorized', 'Please sign in again.')
  return userId
}
