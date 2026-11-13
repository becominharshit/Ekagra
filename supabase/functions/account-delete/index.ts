import { adminClient, signedInUser } from '../_shared/admin.ts'
import { cancelProviderSubscription } from '../_shared/billing.ts'
import { PROFILE_RESET } from '../_shared/userTables.ts'
import { handleAccountRequest } from './handler.ts'
import { removeUserFiles } from './storage.ts'

Deno.serve(
  handleAccountRequest(() => {
    const env = Deno.env.toObject()
    const admin = adminClient(env)
    return {
      env,
      authenticate: (request) => signedInUser(admin, request),
      removeFiles: (userId) => removeUserFiles(admin, userId),
      async cancelSubscription(userId) {
        const { data, error } = await admin
          .from('subscriptions')
          .select('provider, subscription_id, status')
          .eq('user_id', userId)
          .maybeSingle()
        if (error) {
          console.error('[account-delete] subscription lookup failed:', error)
          return
        }
        const sub = data as { provider?: string; subscription_id?: string | null; status?: string } | null
        if (!sub?.subscription_id || (sub.provider !== 'stripe' && sub.provider !== 'razorpay')) return
        if (sub.status === 'canceled' || sub.status === 'expired') return
        if (sub.provider === 'stripe' && !env.STRIPE_SECRET_KEY) return
        if (sub.provider === 'razorpay' && (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET)) return
        try {
          await cancelProviderSubscription({
            provider: sub.provider,
            subscriptionId: sub.subscription_id,
            stripeSecretKey: env.STRIPE_SECRET_KEY,
            razorpayKeyId: env.RAZORPAY_KEY_ID,
            razorpayKeySecret: env.RAZORPAY_KEY_SECRET,
            immediate: true,
          })
        } catch (err) {
          console.error('[account-delete] best-effort subscription cancel failed:', err)
        }
      },
      async deleteRows(userId, table) {
        const { error } = await admin.from(table).delete().eq('user_id', userId)
        if (error) throw error
      },
      async resetProfile(userId) {
        const { error } = await admin.from('profiles').update(PROFILE_RESET).eq('id', userId)
        if (error) throw error
      },
      async deleteUser(userId) {
        const { error } = await admin.auth.admin.deleteUser(userId)
        if (error) throw error
      },
    }
  }),
)
