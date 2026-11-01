import { MockLanguageModelV4 } from 'ai/test'
import type { UsageEntry, UsageStore } from './ai.ts'

// Helpers for the Edge Function tests (Vitest). Production code never imports this file.

export const TEST_SECRETS: Record<string, string> = {
  AI_API_KEY: 'test-key',
  AI_MODEL_SMART: 'smart-model',
  AI_MODEL_FAST: 'fast-model',
  AI_PRICE_SMART_INPUT: '0.75',
  AI_PRICE_SMART_OUTPUT: '3.75',
  AI_PRICE_FAST_INPUT: '0.30',
  AI_PRICE_FAST_OUTPUT: '2.50',
}

/** ai_usage, kept in memory. `requests` and `spentUsd` pretend earlier usage in the last 24 hours. */
export function memoryUsage(earlier: { requests?: number; spentUsd?: number } = {}): UsageStore & { logged: UsageEntry[] } {
  const logged: UsageEntry[] = []
  return {
    logged,
    async requestsSince(userId) {
      return (earlier.requests ?? 0) + logged.filter((entry) => entry.userId === userId).length
    },
    async spentSince() {
      return (earlier.spentUsd ?? 0) + logged.reduce((sum, entry) => sum + entry.costUsd, 0)
    },
    async log(entry) {
      logged.push(entry)
    },
  }
}

/** One answer from the fake model: its text and the tokens it "used". */
export function modelAnswer(text: string, inputTokens = 1000, outputTokens = 500) {
  return {
    content: [{ type: 'text' as const, text }],
    finishReason: { unified: 'stop' as const, raw: undefined },
    usage: {
      inputTokens: { total: inputTokens, noCache: inputTokens, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: outputTokens, text: outputTokens, reasoning: undefined },
    },
    warnings: [],
  }
}

/** A fake model that gives these answers in order (the last one repeats). */
export function fakeModel(...answers: ReturnType<typeof modelAnswer>[]): MockLanguageModelV4 {
  return new MockLanguageModelV4({ doGenerate: answers })
}
