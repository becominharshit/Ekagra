import { adminClient, signedInUser } from '../_shared/admin.ts'
import { getUserAiUsageSummary, loadUserSubscriptionAndEntitlement } from '../_shared/usage.ts'
import { handleUsageRequest } from './handler.ts'

Deno.serve(
  handleUsageRequest(() => {
    const env = Deno.env.toObject()
    const admin = adminClient(env)
    return {
      env,
      authenticate: (request) => signedInUser(admin, request),
      getUsageSummary: (userId, windows) => getUserAiUsageSummary(admin, { userId, ...windows }),
      loadBillingState: (userId, now) => loadUserSubscriptionAndEntitlement(admin, userId, now),
    }
  }),
)
