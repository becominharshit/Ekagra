import { createAnthropic } from '@ai-sdk/anthropic'
import { APICallError, generateText, NoObjectGeneratedError, Output, RetryError, type LanguageModel, type LanguageModelUsage, type ModelMessage } from 'ai'
import type { z } from 'zod'
import { AiError, checkQuota, costUsd, dayBefore, type AiConfig, type Tier } from './aiCore.ts'

// The one door every AI call goes through (AGENTS.md):
//   1. Quota: requests per student per day, and money per day for the whole app.
//   2. The Claude model for the tier (Smart or Fast) and how much it thinks first (aiCore.ts).
//   3. The answer must match a Zod schema. Claude gets the schema as structured output (Anthropic's
//      `output_config.format`; the provider leaves out the limits Anthropic can't take, such as
//      maximum lengths, and Zod still checks them). If it doesn't match, the model gets one more try.
//   4. Tokens and cost are written to ai_usage (one row per request).
// Gemini (Ekagra Studio) also gets help with Google's refusals, which the AI SDK's quick retries
// don't solve: a busy Smart model hands over to the Fast one, and a per-minute limit is waited out
// as long as Google asks (see recoverGemini).

export interface UsageEntry {
  userId: string
  feature: string
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
}

/** Where usage is counted and logged: the ai_usage table in production, memory in tests. */
export interface UsageStore {
  requestsSince(userId: string, since: Date): Promise<number>
  spentSince(since: Date): Promise<number>
  log(entry: UsageEntry): Promise<void>
}

export interface AiTask<T> {
  userId: string
  /** Saved in ai_usage.feature, e.g. 'syllabus'. */
  feature: string
  tier: Tier
  /** The shape the answer must have. */
  schema: z.ZodType<T>
  /** What the model should do and how to answer. */
  instructions: string
  /** Text, or messages that can include files (e.g. a photo of a syllabus). */
  prompt: string | ModelMessage[]
  /**
   * When to give up, for work that has to end in time (studio-notes' background work: Supabase
   * stops a function after 150 seconds). A call never takes longer than TIMEOUT_MS anyway.
   */
  deadline?: Date
}

export interface AiResult<T> {
  data: T
  /** The model that answered, e.g. for lessons.model. */
  model: string
}

export interface AiGateway {
  generate<T>(task: AiTask<T>): Promise<AiResult<T>>
  /** Throws the student's daily-limit or the app's budget error now, before work that ends in an AI call is started. */
  ensureQuota(userId: string): Promise<void>
}

export interface AiGatewayOptions {
  config: AiConfig
  usage: UsageStore
  /**
   * Turns a model name into a model. Tests pass a fake. Without it, Claude models are made for the
   * 'anthropic' provider; Studio's functions pass Gemini's (_shared/gemini.ts), so only they bundle it.
   */
  model?: (modelId: string) => LanguageModel
  now?: () => Date
  /** Waits before Gemini is asked again; tests pass one that doesn't really wait. */
  sleep?: (ms: number) => Promise<void>
}

const RETRY_INSTRUCTION =
  'Your previous answer did not match the required JSON format. Answer again with JSON that matches the schema exactly.'
const TIMEOUT_MS = 120_000
/** Gemini: a Smart model that hasn't answered by then (it can hang when it's busy) hands over to the Fast one. */
const SMART_SHARE_MS = 60_000
/** Gemini: waiting and asking again is only worth it with at least this long left for the answer. */
const MIN_ANSWER_MS = 15_000
/** Gemini: the pause before a busy model is asked once more. */
const BUSY_PAUSE_MS = 2_000
/** Gemini: the longest wait for a per-minute limit (Google says how long; a minute always passes). */
const MAX_LIMIT_WAIT_MS = 61_000

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
/** Room for the longest answer (a whole syllabus) and the thinking before it; only the tokens used are paid for. */
export const MAX_OUTPUT_TOKENS = 32_000

function claudeModels(apiKey: string): (modelId: string) => LanguageModel {
  const anthropic = createAnthropic({ apiKey })
  return (modelId) => anthropic(modelId)
}

function noModels(): LanguageModel {
  throw new AiError(500, 'not_configured', 'This AI function has no models set up (pass them to createAiGateway).')
}

/** The request was stopped because it took too long (AbortSignal.timeout). */
function isTimeout(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && (error.name === 'TimeoutError' || error.name === 'AbortError')
}

/** What Google said when it refused a call (or that it didn't answer in time). */
interface GeminiRefusal {
  status: number | undefined
  timedOut: boolean
  /** 500, 503 ("This model is currently experiencing high demand") or 504: busy for now. */
  busy: boolean
  /** 429 over a limit per minute (tokens or requests): over when Google's minute has passed. */
  perMinute: boolean
  /** 429 over a limit per day: over at midnight Pacific time. */
  perDay: boolean
  /** How long Google asks to wait (its RetryInfo, "retryDelay": "13s"), in milliseconds. */
  retryMs: number | null
}

function geminiRefusal(error: unknown): GeminiRefusal {
  const last = RetryError.isInstance(error) ? error.lastError : error
  const status = APICallError.isInstance(last) ? last.statusCode : undefined
  const body = APICallError.isInstance(last) ? (last.responseBody ?? last.message) : ''
  const delay = /"retryDelay"\s*:\s*"([\d.]+)s"/.exec(body)?.[1] ?? /retry in ([\d.]+)\s*s/i.exec(body)?.[1]
  const seconds = delay === undefined ? Number.NaN : Number.parseFloat(delay)
  const retryMs = Number.isFinite(seconds) ? Math.ceil(seconds * 1000) : null
  const perDay = status === 429 && /PerDay/i.test(body)
  return {
    status,
    timedOut: isTimeout(last),
    busy: status === 500 || status === 503 || status === 504,
    perMinute: status === 429 && !perDay && (/PerMinute/i.test(body) || retryMs !== null),
    perDay,
    retryMs,
  }
}

type GeminiRecovery = { action: 'hand_over' } | { action: 'wait'; ms: number; reason: 'limit' | 'busy' }

/**
 * What to do when Gemini refused or didn't answer, or null to give up:
 * - A Smart task hands over to the Fast model once: each model has its own limits, and it's rarely
 *   busy at the same time.
 * - Over a per-minute limit: wait as long as Google asks, once. Repeating at once, as the AI SDK
 *   does, only gets refused again within the same minute.
 * - Busy: ask once more after a short pause.
 * Each only when enough time is left for an answer after it.
 */
function recoverGemini(refusal: GeminiRefusal, tried: { canHandOver: boolean; waited: boolean; askedAgain: boolean }, msLeft: number): GeminiRecovery | null {
  if (tried.canHandOver && (refusal.busy || refusal.status === 429 || refusal.timedOut) && msLeft >= MIN_ANSWER_MS) return { action: 'hand_over' }
  if (refusal.perMinute && refusal.retryMs !== null && !tried.waited) {
    const ms = Math.min(refusal.retryMs + 1_000, MAX_LIMIT_WAIT_MS)
    if (msLeft - ms >= MIN_ANSWER_MS) return { action: 'wait', ms, reason: 'limit' }
  }
  if (refusal.busy && !tried.askedAgain && msLeft - BUSY_PAUSE_MS >= MIN_ANSWER_MS) return { action: 'wait', ms: BUSY_PAUSE_MS, reason: 'busy' }
  return null
}

/** A failed call as an error the student can act on. Only the status and the provider's message are logged, never the prompt. */
function providerError(error: unknown, modelId: string, provider: AiConfig['provider']): AiError {
  // The AI SDK tries Claude's busy and rate-limited calls again by itself, then wraps the last error.
  const last = RetryError.isInstance(error) ? error.lastError : error
  if (isTimeout(last)) {
    console.error(`AI request to ${modelId} took too long and was stopped`)
    const message =
      provider === 'google'
        ? 'Gemini took too long to answer, so it was stopped. Please try again in a minute.'
        : `The AI took more than ${TIMEOUT_MS / 60_000} minutes, so it was stopped. Please try again.`
    return new AiError(504, 'provider_timeout', message, { cause: error })
  }
  const status = APICallError.isInstance(last) ? last.statusCode : undefined
  const detail = APICallError.isInstance(last) ? (last.responseBody ?? last.message) : last instanceof Error ? last.message : String(last)
  console.error(`AI request to ${modelId} failed${status ? ` (${status})` : ''}: ${detail.slice(0, 500)}`)
  if (provider === 'google') {
    // Google answers a wrong key with 400 API_KEY_INVALID, and an unusable one with 403.
    if ((status === 400 || status === 401 || status === 403) && /api[ _]?key/i.test(detail)) {
      return new AiError(500, 'not_configured', 'Google refused the Gemini key. Check the GEMINI_API_KEY secret (docs/4-setup-guide.md, step 6).', { cause: error })
    }
    // 402: the project pays in advance (prepay billing) and its credit is used up.
    if (status === 402) {
      return new AiError(
        503,
        'provider_billing',
        "Gemini's prepaid credit has run out, so Google refused the request. Add credit in Google AI Studio (ai.studio/projects → Billing), or use a Gemini key from a free-tier project (docs/4-setup-guide.md, \"Ekagra Studio's AI\").",
        { cause: error },
      )
    }
    if (status === 404) {
      return new AiError(500, 'not_configured', `Gemini has no model called "${modelId}". Check STUDIO_AI_MODEL_SMART and STUDIO_AI_MODEL_FAST (docs/4-setup-guide.md).`, { cause: error })
    }
    if (status === 429) {
      const freeTier = /free_?tier/i.test(detail)
      const plan = freeTier ? "Gemini's free tier" : 'your Gemini plan'
      if (/PerDay/i.test(detail)) {
        return new AiError(
          503,
          'provider_limit',
          `${freeTier ? "Gemini's free tier" : 'Your Gemini plan'} has reached today's limit. It starts again at midnight US Pacific time, in the early afternoon in India.`,
          { cause: error },
        )
      }
      // Over the tokens-a-minute limit even after waiting for the next minute (recoverGemini).
      if (/input_token/i.test(detail)) {
        return new AiError(503, 'provider_limit', `This is more than ${plan} reads in one minute. Please try again in a minute${freeTier ? ', or use a Gemini key with billing' : ''}.`, {
          cause: error,
        })
      }
      return new AiError(503, 'provider_busy', `This is more requests than ${plan} takes in one minute. Please try again in a minute.`, { cause: error })
    }
    // 503: "This model is currently experiencing high demand", even after asking again and on the other model.
    if (status === 500 || status === 503 || status === 504) {
      return new AiError(503, 'provider_busy', 'Gemini is very busy right now (Google reports high demand). Please try again in a few minutes.', { cause: error })
    }
    // Something Gemini can't use, e.g. a private or unlisted YouTube video.
    if (status === 400 || status === 403) {
      return new AiError(422, 'unreadable_input', "Gemini couldn't read this. A YouTube video must be public.", { cause: error })
    }
    return new AiError(502, 'provider_error', 'The AI service did not answer. Please try again in a minute.', { cause: error })
  }
  if (status === 401 || status === 403) {
    return new AiError(500, 'not_configured', 'Anthropic refused the AI key. Check the AI_API_KEY secret (docs/4-setup-guide.md, step 6).', { cause: error })
  }
  // 400 "Your credit balance is too low to access the Anthropic API": the prepaid credit is used up.
  if (status === 402 || (status === 400 && /credit balance/i.test(detail))) {
    return new AiError(503, 'provider_billing', "Anthropic's credit has run out, so Claude refused the request. Add credit at platform.claude.com → Billing (docs/4-setup-guide.md, step 6).", {
      cause: error,
    })
  }
  // 429: a rate limit or the plan's monthly cap; 529: overloaded; 400 "…reached your specified API usage limits": the spend limit set in the Console.
  if (status === 429 || status === 529 || (status === 400 && /usage limits/i.test(detail))) {
    return new AiError(503, 'provider_busy', 'The AI service is busy or has reached its spending limit. Please try again later.', { cause: error })
  }
  return new AiError(502, 'provider_error', 'The AI service did not answer. Please try again in a minute.', { cause: error })
}

export function createAiGateway(options: AiGatewayOptions): AiGateway {
  const { config, usage } = options
  const now = options.now ?? (() => new Date())
  const sleep = options.sleep ?? realSleep
  const modelFor = options.model ?? (config.provider === 'anthropic' ? claudeModels(config.apiKey) : noModels)
  const gemini = config.provider === 'google'

  async function ensureQuota(userId: string): Promise<void> {
    const since = dayBefore(now())
    const [requests, spentUsd] = await Promise.all([usage.requestsSince(userId, since), usage.spentSince(since)]).catch(
      (error: unknown) => {
        throw new AiError(503, 'quota_unavailable', "Couldn't check your AI allowance right now. Please try again in a minute.", {
          cause: error,
        })
      },
    )
    const quota = checkQuota({ requests, spentUsd }, config)
    if (!quota.ok) throw new AiError(429, quota.code, quota.message)
  }

  return {
    ensureQuota,
    async generate<T>(task: AiTask<T>): Promise<AiResult<T>> {
      await ensureQuota(task.userId)

      const end = Math.min(now().getTime() + TIMEOUT_MS, task.deadline?.getTime() ?? Number.POSITIVE_INFINITY)
      // Gemini: the Fast model can take over a Smart task (once) when the Smart one is busy.
      const fastCanTakeOver = gemini && task.tier === 'smart' && config.models.fast !== config.models.smart
      let tier = task.tier
      const spent = { input: 0, output: 0, costUsd: 0 }
      // Each try is priced on its own (a long prompt can cost more per token, and the Fast model less).
      const count = (used: LanguageModelUsage | undefined) => {
        const tokens = { input: used?.inputTokens ?? 0, output: used?.outputTokens ?? 0 }
        spent.input += tokens.input
        spent.output += tokens.output
        spent.costUsd += costUsd(tokens, config.prices[tier])
      }
      // Logging must never break a request: the student already waited for the answer.
      const log = async () => {
        if (spent.input + spent.output === 0) return
        const entry: UsageEntry = {
          userId: task.userId,
          feature: task.feature,
          model: config.models[tier],
          inputTokens: spent.input,
          outputTokens: spent.output,
          costUsd: Math.round(spent.costUsd * 1_000_000) / 1_000_000,
        }
        await usage.log(entry).catch((error: unknown) => console.error('Could not log AI usage:', error))
      }

      let wrongShapes = 0
      const tried = { waited: false, askedAgain: false }
      for (;;) {
        const modelId = config.models[tier]
        const handOverPossible = fastCanTakeOver && tier === 'smart'
        const left = end - now().getTime()
        try {
          if (left <= 0) throw new DOMException('No time left for this request', 'TimeoutError')
          const result = await generateText({
            model: modelFor(modelId),
            instructions: wrongShapes === 0 ? task.instructions : `${task.instructions}\n\n${RETRY_INSTRUCTION}`,
            prompt: task.prompt,
            output: Output.object({ schema: task.schema }),
            reasoning: config.reasoning[tier],
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            // Gemini's refusals are handled below (Google says how long to wait); Claude's by the AI SDK.
            ...(gemini ? { maxRetries: 0 } : {}),
            abortSignal: AbortSignal.timeout(handOverPossible ? Math.min(left, SMART_SHARE_MS) : left),
          })
          count(result.usage)
          await log()
          return { data: result.output, model: modelId }
        } catch (error) {
          if (NoObjectGeneratedError.isInstance(error)) {
            count(error.usage)
            wrongShapes += 1
            if (wrongShapes < 2) continue
            await log()
            throw new AiError(422, 'invalid_answer', "The AI's answer didn't have the right shape, even after a second try. Please try again.")
          }
          // Our own errors (e.g. no models set up) pass through as they are.
          if (error instanceof AiError) {
            await log()
            throw error
          }
          if (gemini) {
            const refusal = geminiRefusal(error)
            const next = recoverGemini(refusal, { canHandOver: handOverPossible, ...tried }, end - now().getTime())
            if (next) {
              const why = refusal.timedOut ? "didn't answer in time" : `refused (${refusal.status ?? 'no status'}${refusal.perMinute ? ', per-minute limit' : ''})`
              console.warn(`Gemini ${modelId} ${why}: ${next.action === 'hand_over' ? `asking ${config.models.fast} instead` : `asking again in ${Math.round(next.ms / 1000)} s`}`)
              if (next.action === 'hand_over') {
                tier = 'fast'
              } else {
                if (next.reason === 'limit') tried.waited = true
                else tried.askedAgain = true
                await sleep(next.ms)
              }
              continue
            }
          }
          await log()
          throw providerError(error, modelId, config.provider)
        }
      }
    },
  }
}
