import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError, type SupabaseClient } from '@supabase/supabase-js'
import type { z } from 'zod'
import { useBillingStore } from '@/features/billing/billingStore'
import { requireSupabase } from '@/lib/supabase'

// How the app asks the AI: it calls an Edge Function (supabase/functions/<name>) as the signed-in
// student. The function checks the quota, calls the model and logs the cost (_shared/ai.ts).
// In Demo Mode there is no server, so each feature uses its sample answers instead.

/** The AI Edge Functions. */
export type AiFunction =
  | 'ai-syllabus'
  | 'ai-papers'
  | 'ai-tutor'
  | 'ai-generate'
  | 'ai-capture'
  | 'ai-inbox'
  | 'ai-brief'
  | 'ai-hustle'
  | 'ai-grade'
  | 'ai-review'
  | 'ai-meal'
  | 'ai-speak'
  | 'studio-notes'
  | 'studio-quiz'

/** Every Edge Function the app calls: the AI ones, ai-usage, billing, account-export, and account-delete. */
export type EdgeFunction = AiFunction | 'ai-usage' | 'account-delete' | 'account-export' | 'billing-checkout' | 'billing-portal'

/** The Edge Functions that don't call the AI. */
const NOT_AI = new Set<EdgeFunction>(['ai-usage', 'account-delete', 'account-export', 'billing-checkout', 'billing-portal'])

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

const RETRYABLE_HTTP_STATUS = new Set([429, 500, 502, 503, 504])
const QUOTA_ERROR_CODES = new Set(['daily_limit', 'monthly_token_limit'])
const DEFAULT_MAX_RETRIES = 3
const BACKOFF_BASE_MS = 1_000

const realSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })

async function responseToAiError(response: Response, name: EdgeFunction): Promise<AiRequestError> {
  // Our functions never answer 404, so a 404 means the function isn't deployed yet.
  if (response.status === 404) {
    const what = NOT_AI.has(name) ? `The ${name} function isn't` : "The AI features aren't"
    return new AiRequestError('not_deployed', `${what} on the server yet. Deploy the Edge Functions (docs/4-setup-guide.md, step 6).`)
  }
  const body = await readJson(response)
  if (hasCodeAndMessage(body)) {
    if (!NOT_AI.has(name) && QUOTA_ERROR_CODES.has(body.code)) {
      useBillingStore.getState().openUpgradeModal(body.message, name)
    }
    return new AiRequestError(body.code, body.message)
  }
  if (response.status === 401) return new AiRequestError('unauthorized', 'Please sign in again.')
  return new AiRequestError('server_error', `The AI server sent an error (${response.status}). Please try again.`)
}

async function toAiRequestError(error: unknown, name: EdgeFunction): Promise<AiRequestError> {
  if (error instanceof FunctionsHttpError) {
    const response: unknown = error.context
    if (!(response instanceof Response)) return new AiRequestError('server_error', 'The AI server sent an error. Please try again.')
    return responseToAiError(response, name)
  }
  if (error instanceof FunctionsFetchError) {
    return new AiRequestError('offline', "Couldn't reach the AI server. Check your internet connection and try again.")
  }
  if (error instanceof FunctionsRelayError) {
    return new AiRequestError('server_error', "The AI server isn't reachable right now. Please try again in a minute.")
  }
  return new AiRequestError('server_error', error instanceof Error ? error.message : 'Something went wrong. Please try again.')
}

export interface StreamAiOptions<T, D = Record<string, unknown>> {
  schema: z.ZodType<T>
  deltaSchema?: z.ZodType<D>
  onStatus?: (status: Record<string, unknown>) => void
  onDelta?: (delta: D) => void
  signal?: AbortSignal
  /** Inject in tests to skip browser fetch/Supabase config. */
  fetcher?: typeof fetch
  tokenGetter?: () => Promise<string | null>
  endpointUrl?: string
  apikey?: string
  sleep?: (ms: number) => Promise<void>
  maxRetries?: number
}

function defaultEndpoint(name: EdgeFunction): { url: string; apikey: string } {
  const baseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '')
  const apikey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? ''
  if (!baseUrl || !apikey) {
    throw new AiRequestError(
      'not_configured',
      'Supabase is not connected yet: copy .env.example to .env, fill in your project URL and publishable key, then restart `npm run dev`.',
    )
  }
  return { url: `${baseUrl}/functions/v1/${name}`, apikey }
}

async function defaultToken(): Promise<string | null> {
  const client = requireSupabase()
  const { data } = await client.auth.getSession()
  return data.session?.access_token ?? null
}

function parseSseFrame(rawFrame: string): { event: string; data: unknown } | null {
  const lines = rawFrame.split('\n')
  let event = 'message'
  const dataLines: string[] = []
  for (const line of lines) {
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
  }
  if (dataLines.length === 0) return null
  const joined = dataLines.join('\n')
  try {
    return { event, data: JSON.parse(joined) as unknown }
  } catch {
    return null
  }
}

/**
 * Streams an Edge Function over SSE with exponential-backoff retries on transient 429/503 errors
 * (while opening the billing upgrade modal immediately on quota limit 429s).
 */
export async function streamAiFunction<T, D = Record<string, unknown>>(
  name: EdgeFunction,
  body: Record<string, unknown>,
  options: StreamAiOptions<T, D>,
): Promise<T> {
  const endpoint =
    options.endpointUrl !== undefined
      ? { url: options.endpointUrl, apikey: options.apikey ?? '' }
      : defaultEndpoint(name)
  const fetcher = options.fetcher ?? fetch
  const getToken = options.tokenGetter ?? defaultToken
  const wait = options.sleep ?? ((ms: number) => realSleep(ms, options.signal))
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES

  let response: Response | null = null
  for (let attempt = 0; ; attempt += 1) {
    const token = await getToken()
    let candidate: Response
    try {
      candidate = await fetcher(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...(endpoint.apikey ? { apikey: endpoint.apikey } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: options.signal,
      })
    } catch (error) {
      if (options.signal?.aborted) throw error
      if (attempt < maxRetries) {
        await wait(BACKOFF_BASE_MS * 2 ** attempt)
        continue
      }
      throw new AiRequestError('offline', "Couldn't reach the AI server. Check your internet connection and try again.")
    }

    if (candidate.ok) {
      response = candidate
      break
    }

    const mapped = await responseToAiError(candidate, name)
    const isQuota = QUOTA_ERROR_CODES.has(mapped.code)
    if (!isQuota && RETRYABLE_HTTP_STATUS.has(candidate.status) && attempt < maxRetries) {
      await wait(BACKOFF_BASE_MS * 2 ** attempt)
      continue
    }
    throw mapped
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (contentType.includes('application/json') || !response.body) {
    const jsonBody = await response.json().catch(() => null)
    const parsed = options.schema.safeParse(jsonBody)
    if (!parsed.success) {
      throw new AiRequestError('invalid_answer', "The AI's answer didn't have the right shape. Please try again.")
    }
    return parsed.data
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let finalData: T | null = null
  let streamError: AiRequestError | null = null

  const handleFrame = (raw: string) => {
    const frame = parseSseFrame(raw)
    if (!frame) return
    if (frame.event === 'status') {
      if (frame.data && typeof frame.data === 'object') {
        options.onStatus?.(frame.data as Record<string, unknown>)
      }
      return
    }
    if (frame.event === 'delta') {
      if (options.deltaSchema) {
        const parsedDelta = options.deltaSchema.safeParse(frame.data)
        if (parsedDelta.success) options.onDelta?.(parsedDelta.data)
      } else if (frame.data && typeof frame.data === 'object') {
        options.onDelta?.(frame.data as D)
      }
      return
    }
    if (frame.event === 'error') {
      if (hasCodeAndMessage(frame.data)) {
        if (!NOT_AI.has(name) && QUOTA_ERROR_CODES.has(frame.data.code)) {
          useBillingStore.getState().openUpgradeModal(frame.data.message, name)
        }
        streamError = new AiRequestError(frame.data.code, frame.data.message)
      } else {
        streamError = new AiRequestError('server_error', 'The AI server sent an error. Please try again.')
      }
      return
    }
    if (frame.event === 'done') {
      const parsed = options.schema.safeParse(frame.data)
      if (!parsed.success) {
        streamError = new AiRequestError('invalid_answer', "The AI's answer didn't have the right shape. Please try again.")
      } else {
        finalData = parsed.data
      }
    }
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (value) {
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n')
    } else if (done) {
      buffer += decoder.decode().replace(/\r\n/g, '\n')
    }
    let splitAt = buffer.indexOf('\n\n')
    while (splitAt !== -1) {
      const frame = buffer.slice(0, splitAt)
      buffer = buffer.slice(splitAt + 2)
      handleFrame(frame)
      splitAt = buffer.indexOf('\n\n')
    }
    if (done) break
  }
  if (buffer.trim()) handleFrame(buffer)

  if (streamError) throw streamError
  if (finalData === null) {
    throw new AiRequestError('server_error', 'The AI stream ended before finishing. Please try again.')
  }
  return finalData
}
