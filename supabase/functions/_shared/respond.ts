import type { z } from 'zod'
import { AiError } from './aiCore.ts'

// The HTTP layer shared by every Edge Function:
// - Environment-driven ALLOWED_ORIGINS CORS allowlist (zero wildcard '*')
// - POST-only enforcement and Zod request validation
// - Safe { code, message } JSON error responses

export const DEFAULT_ALLOWED_ORIGINS = [
  'https://ekagra.app',
  'https://www.ekagra.app',
  'https://studio.ekagra.app',
  'capacitor://localhost',
  'ionic://localhost',
] as const

const BASE_CORS_HEADERS = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
} as const

export function parseAllowedOrigins(env?: Record<string, string | undefined>): Set<string> {
  const allowed = new Set<string>(DEFAULT_ALLOWED_ORIGINS)
  const rawLists = [env?.ALLOWED_ORIGINS, env?.SITE_URL, env?.PUBLIC_SITE_URL]
  for (const list of rawLists) {
    if (typeof list !== 'string') continue
    for (const part of list.split(',')) {
      const trimmed = part.trim()
      if (!trimmed) continue
      try {
        allowed.add(new URL(trimmed).origin)
      } catch {
        allowed.add(trimmed)
      }
    }
  }
  return allowed
}

export function isOriginAllowed(origin: string | null | undefined, env?: Record<string, string | undefined>): boolean {
  if (!origin) return false
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    return false
  }
  if ((parsed.protocol === 'capacitor:' || parsed.protocol === 'ionic:') && parsed.hostname === 'localhost') {
    return true
  }
  if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
    return true
  }
  return parseAllowedOrigins(env).has(parsed.origin)
}

export function corsHeadersFor(
  request?: Request,
  env?: Record<string, string | undefined>,
): Record<string, string> {
  const origin = request?.headers.get('origin')?.trim()
  if (origin && isOriginAllowed(origin, env)) {
    return {
      ...BASE_CORS_HEADERS,
      'Access-Control-Allow-Origin': origin,
    }
  }
  return { ...BASE_CORS_HEADERS }
}

export function json(
  body: unknown,
  status = 200,
  request?: Request,
  env?: Record<string, string | undefined>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(request, env), 'Content-Type': 'application/json' },
  })
}

export function sseHeaders(
  request?: Request,
  env?: Record<string, string | undefined>,
): Record<string, string> {
  return {
    ...corsHeadersFor(request, env),
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  }
}

export function formatSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

/** Shared pre-flight check (CORS preflight, POST check, safe error formatting) reusable for JSON or SSE handlers. */
export async function runWithCorsAndErrors(
  request: Request,
  resolveEnv: (() => Record<string, string | undefined>) | undefined,
  run: (env: Record<string, string | undefined> | undefined) => Promise<Response>,
): Promise<Response> {
  let env: Record<string, string | undefined> | undefined
  try {
    env = resolveEnv?.()
  } catch {
    env = undefined
  }

  if (request.method === 'OPTIONS') {
    const origin = request.headers.get('origin')?.trim()
    if (origin && !isOriginAllowed(origin, env)) {
      return json({ code: 'cors_forbidden', message: 'Origin not allowed.' }, 403, request, env)
    }
    return new Response('ok', { headers: corsHeadersFor(request, env) })
  }

  try {
    if (request.method !== 'POST') throw new AiError(405, 'method_not_allowed', 'Use POST.')
    return await run(env)
  } catch (error) {
    if (error instanceof AiError) return json({ code: error.code, message: error.message }, error.status, request, env)
    console.error(error)
    return json({ code: 'server_error', message: 'Something went wrong on the server. Please try again.' }, 500, request, env)
  }
}

/** Turns `run` into a request handler: strict CORS preflight, POST only, JSON response, safe errors. */
export function handleJson(
  run: (request: Request) => Promise<unknown>,
  resolveEnv?: () => Record<string, string | undefined>,
): (request: Request) => Promise<Response> {
  return (request) =>
    runWithCorsAndErrors(request, resolveEnv, async (env) => json(await run(request), 200, request, env))
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
