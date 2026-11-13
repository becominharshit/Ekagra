import { createAiGateway } from './ai.ts'
import { readStudioAiConfig } from './aiCore.ts'
import { geminiModels } from './gemini.ts'
import type { AiFeature, ServerDeps } from './http.ts'
import { handleJson, readBody, requireUser } from './respond.ts'

// Like http.ts's handleAiRequest, for Ekagra Studio's functions (studio-*): Studio's Gemini secrets
// and models, the same limits and ai_usage. A separate file, so Ekagra's functions don't bundle Gemini.

export function handleStudioAiRequest<I, O>(feature: AiFeature<I, O>, deps: () => ServerDeps): (request: Request) => Promise<Response> {
  return handleJson(
    async (request) => {
      const { env, authenticate, usage, cache, model } = deps()
      const userId = await requireUser(authenticate, request)
      const input = await readBody(request, feature.input)
      const config = readStudioAiConfig(env)
      const ai = createAiGateway({ config, usage, model: model ?? geminiModels(config.apiKey) })
      return feature.run({ input, userId, ai, cache })
    },
    () => deps().env,
  )
}
