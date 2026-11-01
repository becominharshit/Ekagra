import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// The admin client (the project's secret key: it skips RLS) and the sign-in check, for every Edge
// Function in production. Use the admin client only for what the function is there to do.

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

export function adminClient(env: Record<string, string | undefined>): SupabaseClient {
  if (!admin) {
    const url = env.SUPABASE_URL
    const secretKey = defaultKey(env.SUPABASE_SECRET_KEYS, env.SUPABASE_SERVICE_ROLE_KEY)
    if (!url || !secretKey) throw new Error('SUPABASE_URL or the secret key is missing in the Edge Function environment.')
    admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
  }
  return admin
}

/** The signed-in student's id from the request's sign-in token, or null. */
export async function signedInUser(client: SupabaseClient, request: Request): Promise<string | null> {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  // Checks the token's signature and expiry; only real signed-in users are let through.
  const { data, error } = await client.auth.getClaims(token)
  if (error || !data) return null
  const { sub, role } = data.claims
  return typeof sub === 'string' && sub !== '' && role === 'authenticated' ? sub : null
}
