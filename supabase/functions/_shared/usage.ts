import type { SupabaseClient } from '@supabase/supabase-js'
import type { UsageStore } from './ai.ts'

// AI usage in the ai_usage table. This needs the admin (secret key) client: students can read
// their own usage but never write it (see the RLS policies in 001_phase1_core.sql).

const PAGE_SIZE = 1000
const MAX_PAGES = 10

/**
 * What every student's AI requests since `since` cost (USD). Supabase's API can't add up a column,
 * so the rows are added up here, one page of 1000 at a time. More than `maxPages` pages gives
 * Infinity: for one day that is far over any budget, so the quota check can stop there.
 */
export async function spendSince(admin: SupabaseClient, since: Date, maxPages = MAX_PAGES): Promise<number> {
  let total = 0
  for (let page = 0; page < maxPages; page++) {
    const from = page * PAGE_SIZE
    const { data, error } = await admin
      .from('ai_usage')
      .select('cost_usd')
      .gte('created_at', since.toISOString())
      .order('created_at')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const rows: { cost_usd: number | string }[] = data
    total += rows.reduce((sum, row) => sum + Number(row.cost_usd), 0)
    if (rows.length < PAGE_SIZE) return total
  }
  return Number.POSITIVE_INFINITY
}

export function supabaseUsageStore(admin: SupabaseClient): UsageStore {
  return {
    async requestsSince(userId, since) {
      const { count, error } = await admin
        .from('ai_usage')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', since.toISOString())
      if (error) throw error
      return count ?? 0
    },

    spentSince: (since) => spendSince(admin, since),

    async log(entry) {
      const { error } = await admin.from('ai_usage').insert({
        user_id: entry.userId,
        feature: entry.feature,
        model: entry.model,
        input_tokens: entry.inputTokens,
        output_tokens: entry.outputTokens,
        cost_usd: entry.costUsd,
      })
      if (error) throw error
    },
  }
}
