import { createGoogle } from '@ai-sdk/google'
import { generateText, NoObjectGeneratedError, Output, type LanguageModel, type LanguageModelUsage, type ModelMessage } from 'ai'
import type { z } from 'zod'
import { AiError, checkQuota, costUsd, dayBefore, type AiConfig, type Tier } from './aiCore.ts'

// The one door every AI call goes through (AGENTS.md):
//   1. Quota: requests per student per day, and money per day for the whole app.
//   2. The model for the tier (Smart or Fast); the model names live in the secrets.
//   3. The answer must match a Zod schema. If it doesn't, the model gets one more try.
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
}

export interface AiGatewayOptions {
  config: AiConfig
  usage: UsageStore
  /** Turns a model name into a model. Tests pass a fake; by default the configured provider is used. */
  model?: (modelId: string) => LanguageModel
  now?: () => Date
}

const RETRY_INSTRUCTION =
  'Your previous answer did not match the required JSON format. Answer again with JSON that matches the schema exactly.'
const TIMEOUT_MS = 120_000

function googleModels(apiKey: string): (modelId: string) => LanguageModel {
  const google = createGoogle({ apiKey })
  return (modelId) => google(modelId)
}

export function createAiGateway(options: AiGatewayOptions): AiGateway {
  const { config, usage } = options
  const now = options.now ?? (() => new Date())
  const modelFor = options.model ?? googleModels(config.apiKey)

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
    async generate<T>(task: AiTask<T>): Promise<AiResult<T>> {
      await ensureQuota(task.userId)

      const modelId = config.models[task.tier]
      const tokens = { input: 0, output: 0 }
      const count = (used: LanguageModelUsage | undefined) => {
        tokens.input += used?.inputTokens ?? 0
        tokens.output += used?.outputTokens ?? 0
      }
      // Logging must never break a request: the student already waited for the answer.
      const log = async () => {
        if (tokens.input + tokens.output === 0) return
        const entry: UsageEntry = {
          userId: task.userId,
          feature: task.feature,
          model: modelId,
          inputTokens: tokens.input,
          outputTokens: tokens.output,
          costUsd: costUsd(tokens, config.prices[task.tier]),
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
          throw new AiError(502, 'provider_error', 'The AI service did not answer. Please try again in a minute.', {
            cause: error,
          })
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
