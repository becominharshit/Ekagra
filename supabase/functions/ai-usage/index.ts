import { adminClient, signedInUser } from '../_shared/admin.ts'
import { spendSince } from '../_shared/usage.ts'
import { handleUsageRequest } from './handler.ts'

Deno.serve(
  handleUsageRequest(() => {
    const env = Deno.env.toObject()
    const admin = adminClient(env)
    return {
      env,
      authenticate: (request) => signedInUser(admin, request),
      spentSince: (since, maxPages) => spendSince(admin, since, maxPages),
    }
  }),
)
