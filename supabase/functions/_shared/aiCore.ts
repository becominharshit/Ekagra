import { z } from 'zod'
import { DEFAULT_AI_LIMITS } from './schemas.ts'

// The plain parts of the AI gateway: reading the settings, the quota rules and the cost.
// No network and no Deno in here, so Vitest tests it like any other function.

/** Smart = the top model (syllabus, past papers, the weekly review, hustle plans). Fast = the cheap model (everything else). */
export type Tier = 'smart' | 'fast'

/** An error with an HTTP status and a short code. The message is safe to show to the student. */
export class AiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AiError'
    this.status = status
    this.code = code
  }
}

export interface Price {
  /** USD per 1 million input tokens. */
  input: number
  /** USD per 1 million output tokens. */
  output: number
  /** Higher prices for a request whose prompt has more than `inputTokens` tokens (Claude Haiku 5.5). */
  longPrompt?: { inputTokens: number; input: number; output: number }
}

/** How much the model thinks before it answers (the AI SDK's `reasoning`): more helps hard tasks, but is slower and costs more. */
export const REASONING_LEVELS = ['none', 'low', 'medium', 'high'] as const
export type Reasoning = (typeof REASONING_LEVELS)[number]

export interface AiConfig {
  provider: 'anthropic'
  apiKey: string
  models: Record<Tier, string>
  prices: Record<Tier, Price>
  reasoning: Record<Tier, Reasoning>
  monthlyBudgetUsd: number
  userDailyRequests: number
}

/** The Claude models used when AI_MODEL_SMART and AI_MODEL_FAST aren't set (docs/4-setup-guide.md, step 6). */
export const DEFAULT_MODELS: Record<Tier, string> = { smart: 'claude-sonnet-5-5', fast: 'claude-haiku-5-5' }
/** Smart thinks a little first (syllabi, past papers, the weekly review); Fast answers straight away. */
export const DEFAULT_REASONING: Record<Tier, Reasoning> = { smart: 'low', fast: 'none' }

/**
 * Claude prices in USD per million tokens (platform.claude.com/docs/en/about-claude/pricing,
 * November 2026), used when the AI_PRICE_* secrets aren't set. Another model needs those secrets.
 */
export const KNOWN_PRICES: Readonly<Record<string, Price>> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5, longPrompt: { inputTokens: 100_000, input: 0.5, output: 2.5 } },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
}

/** The known price of a model, by its name or a dated name of it (claude-haiku-4-5-20251001). */
export function knownPrice(model: string): Price | undefined {
  const name = Object.keys(KNOWN_PRICES).find((known) => model === known || model.startsWith(`${known}-20`))
  return name ? KNOWN_PRICES[name] : undefined
}

// Secrets arrive as text. An empty value (`AI_API_KEY=`) counts as missing.
const blankToMissing = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value)
const text = z.preprocess(blankToMissing, z.string())
const price = z.preprocess(blankToMissing, z.coerce.number().min(0).optional())
/** Only Claude models: a model name left over from another provider is an error, not a failing request. */
const claudeModel = (fallback: string) => z.preprocess(blankToMissing, z.string().trim().startsWith('claude-').default(fallback))
const reasoning = (fallback: Reasoning) => z.preprocess(blankToMissing, z.enum(REASONING_LEVELS).default(fallback))

const limitsSchema = z.object({
  AI_MONTHLY_BUDGET_USD: z.preprocess(blankToMissing, z.coerce.number().positive().default(DEFAULT_AI_LIMITS.monthlyBudgetUsd)),
  AI_USER_DAILY_REQUESTS: z.preprocess(blankToMissing, z.coerce.number().int().positive().default(DEFAULT_AI_LIMITS.userDailyRequests)),
})

const secretsSchema = limitsSchema
  .extend({
    AI_PROVIDER: z.preprocess(blankToMissing, z.literal('anthropic').default('anthropic')),
    AI_API_KEY: text,
    AI_MODEL_SMART: claudeModel(DEFAULT_MODELS.smart),
    AI_MODEL_FAST: claudeModel(DEFAULT_MODELS.fast),
    AI_PRICE_SMART_INPUT: price,
    AI_PRICE_SMART_OUTPUT: price,
    AI_PRICE_FAST_INPUT: price,
    AI_PRICE_FAST_OUTPUT: price,
    AI_REASONING_SMART: reasoning(DEFAULT_REASONING.smart),
    AI_REASONING_FAST: reasoning(DEFAULT_REASONING.fast),
  })
  .transform((secrets, context) => {
    // A known model brings its prices; prices set as secrets (both of a tier) replace them.
    const priceOf = (tier: 'SMART' | 'FAST', model: string, input: number | undefined, output: number | undefined): Price => {
      const known = knownPrice(model)
      if (input === undefined && output === undefined && known) return known
      if (input === undefined) context.addIssue({ code: 'custom', path: [`AI_PRICE_${tier}_INPUT`], message: `Needed for ${model}` })
      if (output === undefined) context.addIssue({ code: 'custom', path: [`AI_PRICE_${tier}_OUTPUT`], message: `Needed for ${model}` })
      return { input: input ?? 0, output: output ?? 0 }
    }
    return {
      ...secrets,
      prices: {
        smart: priceOf('SMART', secrets.AI_MODEL_SMART, secrets.AI_PRICE_SMART_INPUT, secrets.AI_PRICE_SMART_OUTPUT),
        fast: priceOf('FAST', secrets.AI_MODEL_FAST, secrets.AI_PRICE_FAST_INPUT, secrets.AI_PRICE_FAST_OUTPUT),
      },
    }
  })

/** One error that names every missing or wrong secret. */
function notConfigured(error: z.ZodError): AiError {
  const names = [...new Set(error.issues.map((issue) => String(issue.path[0])))]
  return new AiError(
    500,
    'not_configured',
    `AI is not set up on the server yet. Check these Edge Function secrets: ${names.join(', ')} (docs/4-setup-guide.md, step 6).`,
  )
}

/** Reads the AI secrets. If any are missing or wrong, one error names all of them. */
export function readAiConfig(env: Record<string, string | undefined>): AiConfig {
  const parsed = secretsSchema.safeParse(env)
  if (!parsed.success) throw notConfigured(parsed.error)
  const secrets = parsed.data
  return {
    provider: secrets.AI_PROVIDER,
    apiKey: secrets.AI_API_KEY,
    models: { smart: secrets.AI_MODEL_SMART, fast: secrets.AI_MODEL_FAST },
    prices: secrets.prices,
    reasoning: { smart: secrets.AI_REASONING_SMART, fast: secrets.AI_REASONING_FAST },
    monthlyBudgetUsd: secrets.AI_MONTHLY_BUDGET_USD,
    userDailyRequests: secrets.AI_USER_DAILY_REQUESTS,
  }
}

export type UsageLimits = Pick<AiConfig, 'monthlyBudgetUsd' | 'userDailyRequests'>

/** Only the two limits, with the same defaults: the AI usage dashboard works before the AI is set up. */
export function readUsageLimits(env: Record<string, string | undefined>): UsageLimits {
  const parsed = limitsSchema.safeParse(env)
  if (!parsed.success) throw notConfigured(parsed.error)
  return { monthlyBudgetUsd: parsed.data.AI_MONTHLY_BUDGET_USD, userDailyRequests: parsed.data.AI_USER_DAILY_REQUESTS }
}

/** Whether every AI secret is set (and right). */
export function isAiConfigured(env: Record<string, string | undefined>): boolean {
  return secretsSchema.safeParse(env).success
}

const DAY_MS = 24 * 60 * 60 * 1000

/** The start of the 24-hour window the limits count. */
export function dayBefore(now: Date): Date {
  return new Date(now.getTime() - DAY_MS)
}

/** The monthly budget, spread evenly: at most 1/30 of it can be spent in any 24 hours. */
export function dailyBudgetUsd(config: Pick<AiConfig, 'monthlyBudgetUsd'>): number {
  return config.monthlyBudgetUsd / 30
}

export interface UsageSoFar {
  /** This student's AI requests in the last 24 hours. */
  requests: number
  /** What everyone's AI requests cost in the last 24 hours (USD). */
  spentUsd: number
}

export type QuotaCheck = { ok: true } | { ok: false; code: 'daily_limit' | 'budget_reached'; message: string }

/** Two limits: requests per student per day, and money per day for the whole app. */
export function checkQuota(usage: UsageSoFar, config: AiConfig): QuotaCheck {
  if (usage.requests >= config.userDailyRequests) {
    return {
      ok: false,
      code: 'daily_limit',
      message: `You've used your ${config.userDailyRequests} AI requests for today. They come back over the next 24 hours.`,
    }
  }
  if (usage.spentUsd >= dailyBudgetUsd(config)) {
    return {
      ok: false,
      code: 'budget_reached',
      message: "The app's AI budget for today is used up. AI features will be back within 24 hours.",
    }
  }
  return { ok: true }
}

/** What a request cost in USD, rounded to 6 decimals like ai_usage.cost_usd. A long prompt can cost more per token. */
export function costUsd(tokens: { input: number; output: number }, price: Price): number {
  const rates = price.longPrompt && tokens.input > price.longPrompt.inputTokens ? price.longPrompt : price
  const cost = (tokens.input * rates.input + tokens.output * rates.output) / 1_000_000
  return Math.round(cost * 1_000_000) / 1_000_000
}
