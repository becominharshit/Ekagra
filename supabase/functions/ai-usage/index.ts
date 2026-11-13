import { adminClient, signedInUser } from '../_shared/admin.ts'
import { loadUserSubscriptionAndEntitlement, requestsSince, spendSince, tokensSince } from '../_shared/usage.ts'
import { handleUsageRequest } from './handler.ts'

Deno.serve(
  handleUsageRequest(() => {
    const env = Deno.env.toObject()
    const admin = adminClient(env)
    return {
      env,
      authenticate: (request) => signedInUser(admin, request),
      spentSince: (since, maxPages) => spendSince(admin, since, maxPages),
      userRequestsSince: (userId, since) => requestsSince(admin, userId, since),
      userTokensSince: (userId, since, maxPages) => tokensSince(admin, userId, since, maxPages),
      loadBillingState: (userId, now) => loadUserSubscriptionAndEntitlement(admin, userId, now),
    }
  }),
)
