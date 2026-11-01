import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { handleAiRequest, type AiFeature, type ServerDeps } from './http.ts'
import { supabaseUsageStore } from './usage.ts'

// Starts an AI Edge Function in production: real secrets, the real sign-in check and ai_usage.
// Each function's index.ts is just `serveAi(feature)`.

/** Supabase gives keys as JSON, e.g. {"default": "sb_secret_…"}; older projects have one legacy key. */
function defaultKey(keysJson: string | undefined, legacyKey: string | undefined): string | undefined {
  if (keysJson) {
    try {
      const keys = JSON.parse(keysJson) as Record<string, string>
      return keys.default ?? Object.values(keys)[0] ?? legacyKey
    } catch {
      return legacyKey
    }
  }
  return legacyKey
}

let admin: SupabaseClient | null = null

function productionDeps(): ServerDeps {
  const env = Deno.env.toObject()
  if (!admin) {
    const url = env.SUPABASE_URL
    const secretKey = defaultKey(env.SUPABASE_SECRET_KEYS, env.SUPABASE_SERVICE_ROLE_KEY)
    if (!url || !secretKey) throw new Error('SUPABASE_URL or the secret key is missing in the Edge Function environment.')
    admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
  }
  const client = admin
  return {
    env,
    usage: supabaseUsageStore(client),
    async authenticate(request) {
      const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
      if (!token) return null
      // Checks the token's signature and expiry; only real signed-in users are let through.
      const { data, error } = await client.auth.getClaims(token)
      if (error || !data) return null
      const { sub, role } = data.claims
      return typeof sub === 'string' && sub !== '' && role === 'authenticated' ? sub : null
    },
  }
}

export function serveAi<I, O>(feature: AiFeature<I, O>): void {
  Deno.serve(handleAiRequest(feature, productionDeps))
}
