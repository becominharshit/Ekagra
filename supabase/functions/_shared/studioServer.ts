import { adminClient, signedInUser } from './admin.ts'
import type { AiFeature } from './http.ts'
import { handleStudioAiRequest } from './studioHttp.ts'
import { supabaseUsageStore } from './usage.ts'

// Starts one of Ekagra Studio's AI functions in production (like server.ts for Ekagra's): real
// secrets, the real sign-in check and ai_usage. Its index.ts is just `serveStudioAi(feature)`.

export function serveStudioAi<I, O>(feature: AiFeature<I, O>): void {
  Deno.serve(
    handleStudioAiRequest(feature, () => {
      const env = Deno.env.toObject()
      const client = adminClient(env)
      return { env, usage: supabaseUsageStore(client), authenticate: (request) => signedInUser(client, request) }
    }),
  )
}
