import { MockLanguageModelV4 } from 'ai/test'
import type { UsageEntry, UsageStore } from './ai.ts'
import type { PlanEntitlement } from './billing.ts'

// Helpers for the Edge Function tests (Vitest). Production code never imports this file.

export const TEST_SECRETS: Record<string, string> = {
  AI_API_KEY: 'test-key',
  AI_MODEL_SMART: 'claude-smart-test',
  AI_MODEL_FAST: 'claude-fast-test',
  AI_PRICE_SMART_INPUT: '0.75',
  AI_PRICE_SMART_OUTPUT: '3.75',
  AI_PRICE_FAST_INPUT: '0.30',
  AI_PRICE_FAST_OUTPUT: '2.50',
}

/** ai_usage, kept in memory, with optional pre-populated requests, monthly tokens, USD spend, and tier entitlement. */
export function memoryUsage(
  earlier: { requests?: number; monthlyTokens?: number; spentUsd?: number; entitlement?: PlanEntitlement } = {},
): UsageStore & { logged: UsageEntry[] } {
  const logged: UsageEntry[] = []
  return {
    logged,
    async requestsSince(userId) {
      return (earlier.requests ?? 0) + logged.filter((entry) => entry.userId === userId).length
    },
    async tokensSince(userId) {
      return (
        (earlier.monthlyTokens ?? 0) +
        logged
          .filter((entry) => entry.userId === userId)
          .reduce((sum, entry) => sum + entry.inputTokens + entry.outputTokens, 0)
      )
    },
    async spentSince() {
      return (earlier.spentUsd ?? 0) + logged.reduce((sum, entry) => sum + entry.costUsd, 0)
    },
    ...(earlier.entitlement
      ? {
          async getEntitlement() {
            return earlier.entitlement!
          },
        }
      : {}),
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

/** Builds a v4 stream result mirroring `modelAnswer`, split into multiple text-delta chunks. */
export function modelStreamAnswer(text: string, inputTokens = 1000, outputTokens = 500) {
  const chunks: Array<
    | { type: 'stream-start'; warnings: [] }
    | { type: 'text-start'; id: string }
    | { type: 'text-delta'; id: string; delta: string }
    | { type: 'text-end'; id: string }
    | {
        type: 'finish'
        finishReason: { unified: 'stop'; raw: undefined }
        usage: {
          inputTokens: { total: number; noCache: number; cacheRead: undefined; cacheWrite: undefined }
          outputTokens: { total: number; text: number; reasoning: undefined }
        }
      }
  > = [{ type: 'stream-start', warnings: [] }, { type: 'text-start', id: 'text-0' }]

  const step = Math.max(8, Math.ceil(text.length / 4))
  for (let i = 0; i < text.length; i += step) {
    chunks.push({ type: 'text-delta', id: 'text-0', delta: text.slice(i, i + step) })
  }
  chunks.push(
    { type: 'text-end', id: 'text-0' },
    {
      type: 'finish',
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: inputTokens, noCache: inputTokens, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: outputTokens, text: outputTokens, reasoning: undefined },
      },
    },
  )

  return {
    stream: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk)
        controller.close()
      },
    }),
  }
}

/** A fake model that gives these answers in order (supporting both generate and stream calls). */
export function fakeModel(...answers: ReturnType<typeof modelAnswer>[]): MockLanguageModelV4 {
  let streamCall = 0
  return new MockLanguageModelV4({
    doGenerate: answers,
    doStream: async () => {
      const answer = answers[Math.min(streamCall, Math.max(0, answers.length - 1))]
      streamCall += 1
      const text = answer?.content[0]?.type === 'text' ? answer.content[0].text : '{}'
      const inputTokens = answer?.usage.inputTokens.total ?? 1000
      const outputTokens = answer?.usage.outputTokens.total ?? 500
      return modelStreamAnswer(text, inputTokens, outputTokens)
    },
  })
}
