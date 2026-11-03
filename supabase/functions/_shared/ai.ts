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
}

const RETRY_INSTRUCTION =
  'Your previous answer did not match the required JSON format. Answer again with JSON that matches the schema exactly.'
const TIMEOUT_MS = 120_000
/** Room for the longest answer (a whole syllabus) and the thinking before it; only the tokens used are paid for. */
export const MAX_OUTPUT_TOKENS = 32_000

function claudeModels(apiKey: string): (modelId: string) => LanguageModel {
  const anthropic = createAnthropic({ apiKey })
  return (modelId) => anthropic(modelId)
}

function noModels(): LanguageModel {
  throw new AiError(500, 'not_configured', 'This AI function has no models set up (pass them to createAiGateway).')
}

/** The request was stopped because it took longer than TIMEOUT_MS (AbortSignal.timeout). */
function isTimeout(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && (error.name === 'TimeoutError' || error.name === 'AbortError')
}

/** A failed call as an error the student can act on. Only the status and the provider's message are logged, never the prompt. */
function providerError(error: unknown, modelId: string, provider: AiConfig['provider']): AiError {
  // The AI SDK tries busy and rate-limited calls again by itself, then wraps the last error.
  const last = RetryError.isInstance(error) ? error.lastError : error
  if (isTimeout(last)) {
    console.error(`AI request to ${modelId} took more than ${TIMEOUT_MS / 1000} seconds and was stopped`)
    return new AiError(504, 'provider_timeout', `The AI took more than ${TIMEOUT_MS / 60_000} minutes, so it was stopped. Please try again.`, { cause: error })
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
      // Over the tokens-a-minute limit: one big request (a long video) can be over it on its own, so waiting doesn't help.
      if (/input_token/i.test(detail)) {
        const freeTier = /free_tier/i.test(detail)
        return new AiError(
          503,
          'provider_limit',
          `This is more than ${freeTier ? "Gemini's free tier" : 'your Gemini plan'} reads in one minute. Try a shorter video or fewer pages${freeTier ? ', or use a Gemini key with billing' : ''}.`,
          { cause: error },
        )
      }
      return new AiError(503, 'provider_busy', 'Gemini is busy or has reached its limit for now. Please try again later.', { cause: error })
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
  const modelFor = options.model ?? (config.provider === 'anthropic' ? claudeModels(config.apiKey) : noModels)

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

      const modelId = config.models[task.tier]
      const spent = { input: 0, output: 0, costUsd: 0 }
      // Each try is priced on its own (a long prompt can cost more per token).
      const count = (used: LanguageModelUsage | undefined) => {
        const tokens = { input: used?.inputTokens ?? 0, output: used?.outputTokens ?? 0 }
        spent.input += tokens.input
        spent.output += tokens.output
        spent.costUsd += costUsd(tokens, config.prices[task.tier])
      }
      // Logging must never break a request: the student already waited for the answer.
      const log = async () => {
        if (spent.input + spent.output === 0) return
        const entry: UsageEntry = {
          userId: task.userId,
          feature: task.feature,
          model: modelId,
          inputTokens: spent.input,
          outputTokens: spent.output,
          costUsd: Math.round(spent.costUsd * 1_000_000) / 1_000_000,
        }
        await usage.log(entry).catch((error: unknown) => console.error('Could not log AI usage:', error))
      }

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const result = await generateText({
            model: modelFor(modelId),
            instructions: attempt === 1 ? task.instructions : `${task.instructions}\n\n${RETRY_INSTRUCTION}`,
            prompt: task.prompt,
            output: Output.object({ schema: task.schema }),
            reasoning: config.reasoning[task.tier],
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            abortSignal: AbortSignal.timeout(TIMEOUT_MS),
          })
          count(result.usage)
          await log()
          return { data: result.output, model: modelId }
        } catch (error) {
          if (NoObjectGeneratedError.isInstance(error)) {
            count(error.usage)
            continue
          }
          await log()
          // Our own errors (e.g. no models set up) pass through as they are.
          if (error instanceof AiError) throw error
          throw providerError(error, modelId, config.provider)
        }
      }

      await log()
      throw new AiError(
        422,
        'invalid_answer',
        "The AI's answer didn't have the right shape, even after a second try. Please try again.",
      )
    },
  }
}
