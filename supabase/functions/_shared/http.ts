import type { LanguageModel } from 'ai'
import type { z } from 'zod'
import { createAiGateway, type AiGateway, type UsageStore } from './ai.ts'
import { readAiConfig } from './aiCore.ts'
import { handleJson, readBody, requireUser } from './respond.ts'

// The HTTP part of every AI function: the shared request handling (respond.ts: CORS, POST only,
// errors as { code, message } JSON), the sign-in check, the request body, then the AI gateway.

/** One AI feature, e.g. "syllabus → topic tree". */
export interface AiFeature<I, O> {
  /** Saved in ai_usage.feature. */
  feature: string
  /** The shape of the request body. */
  input: z.ZodType<I>
  run(context: { input: I; userId: string; ai: AiGateway }): Promise<O>
}

/** What a request needs from the outside world. Production builds these from Supabase; tests pass fakes. */
export interface ServerDeps {
  env: Record<string, string | undefined>
  /** The signed-in student's id, or null when the request has no valid sign-in. */
  authenticate(request: Request): Promise<string | null>
  usage: UsageStore
  model?: (modelId: string) => LanguageModel
}

export function handleAiRequest<I, O>(feature: AiFeature<I, O>, deps: () => ServerDeps): (request: Request) => Promise<Response> {
  return handleJson(
    async (request) => {
      const { env, authenticate, usage, model } = deps()
      const userId = await requireUser(authenticate, request)
      const input = await readBody(request, feature.input)
      const ai = createAiGateway({ config: readAiConfig(env), usage, model })
      return feature.run({ input, userId, ai })
    },
    () => deps().env,
  )
}
