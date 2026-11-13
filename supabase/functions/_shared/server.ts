import { adminClient, signedInUser } from './admin.ts'
import { handleAiRequest, type AiFeature, type ServerDeps } from './http.ts'
import { supabaseUsageStore } from './usage.ts'

// Starts an AI Edge Function in production: real secrets, the real sign-in check and ai_usage.
// Each function's index.ts is just `serveAi(feature)`.

export function productionDeps(): ServerDeps {
  const env = Deno.env.toObject()
  const client = adminClient(env)
  return {
    env,
    usage: supabaseUsageStore(client),
    authenticate: (request) => signedInUser(client, request),
  }
}

export function serveAi<I, O>(feature: AiFeature<I, O>): void {
  Deno.serve(handleAiRequest(feature, productionDeps))
}
