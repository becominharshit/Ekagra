import { z } from 'zod'

// The plain parts of the AI gateway: reading the settings, the quota rules and the cost.
// No network and no Deno in here, so Vitest tests it like any other function.

/** Smart = the top model (syllabus, past papers). Fast = the cheap model (everything else). */
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
}

export interface AiConfig {
  provider: 'google'
  apiKey: string
  models: Record<Tier, string>
  prices: Record<Tier, Price>
  monthlyBudgetUsd: number
  userDailyRequests: number
}

// Secrets arrive as text. An empty value (`AI_API_KEY=`) counts as missing.
const blankToMissing = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value)
const text = z.preprocess(blankToMissing, z.string())
const number = z.preprocess(blankToMissing, z.coerce.number().min(0))

const secretsSchema = z.object({
  AI_PROVIDER: z.preprocess(blankToMissing, z.literal('google').default('google')),
  AI_API_KEY: text,
  AI_MODEL_SMART: text,
  AI_MODEL_FAST: text,
  AI_PRICE_SMART_INPUT: number,
  AI_PRICE_SMART_OUTPUT: number,
  AI_PRICE_FAST_INPUT: number,
  AI_PRICE_FAST_OUTPUT: number,
  AI_MONTHLY_BUDGET_USD: z.preprocess(blankToMissing, z.coerce.number().positive().default(10)),
  AI_USER_DAILY_REQUESTS: z.preprocess(blankToMissing, z.coerce.number().int().positive().default(150)),
})

/** Reads the AI secrets. If any are missing or wrong, one error names all of them. */
export function readAiConfig(env: Record<string, string | undefined>): AiConfig {
  const parsed = secretsSchema.safeParse(env)
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))]
    throw new AiError(
      500,
      'not_configured',
      `AI is not set up on the server yet. Check these Edge Function secrets: ${names.join(', ')} (docs/4-setup-guide.md, step 6).`,
    )
  }
  const secrets = parsed.data
  return {
    provider: secrets.AI_PROVIDER,
    apiKey: secrets.AI_API_KEY,
    models: { smart: secrets.AI_MODEL_SMART, fast: secrets.AI_MODEL_FAST },
    prices: {
      smart: { input: secrets.AI_PRICE_SMART_INPUT, output: secrets.AI_PRICE_SMART_OUTPUT },
      fast: { input: secrets.AI_PRICE_FAST_INPUT, output: secrets.AI_PRICE_FAST_OUTPUT },
    },
    monthlyBudgetUsd: secrets.AI_MONTHLY_BUDGET_USD,
    userDailyRequests: secrets.AI_USER_DAILY_REQUESTS,
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

/** The start of the 24-hour window the limits count. */
export function dayBefore(now: Date): Date {
  return new Date(now.getTime() - DAY_MS)
}

/** The monthly budget, spread evenly: at most 1/30 of it can be spent in any 24 hours. */
export function dailyBudgetUsd(config: AiConfig): number {
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

/** What a request cost in USD, rounded to 6 decimals like ai_usage.cost_usd. */
export function costUsd(tokens: { input: number; output: number }, price: Price): number {
  const cost = (tokens.input * price.input + tokens.output * price.output) / 1_000_000
  return Math.round(cost * 1_000_000) / 1_000_000
}
