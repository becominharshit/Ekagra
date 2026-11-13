import { AiError } from '../_shared/aiCore.ts'
import { handleJson, readBody, requireUser } from '../_shared/respond.ts'
import { AccountDeleteRequestSchema, type AccountDeleteResponse } from '../_shared/schemas.ts'
import { KEPT_BY_WIPE, USER_TABLES, type UserTable } from '../_shared/userTables.ts'

// Me → Account and privacy: "Wipe my data" and "Delete my account". Both need the secret key
// (students can't delete files or their sign-in account themselves), and both only ever touch the
// signed-in student's own rows and files. No AI call.
//   data:    the files, then every row the student added (children first), then the profile is
//            reset so setup starts again. AI usage stays: it counts the daily limit and the budget.
//   account: the files, then the sign-in account itself; every row goes with it (on delete cascade).
// Files go first: a row can always be found again, a file whose row is gone can't.

export interface AccountDeps {
  env?: Record<string, string | undefined>
  /** The signed-in student's id, or null. */
  authenticate(request: Request): Promise<string | null>
  /** Deletes every file under <userId>/ in the private buckets; returns how many. */
  removeFiles(userId: string): Promise<number>
  /** Deletes the student's rows in one table. */
  deleteRows(userId: string, table: UserTable): Promise<void>
  /** Puts the profile back to how sign-up left it (PROFILE_RESET). */
  resetProfile(userId: string): Promise<void>
  /** Cancels any active paid subscription on Stripe/Razorpay before removing the account. */
  cancelSubscription?: (userId: string) => Promise<void>
  /** Deletes the sign-in account; every row goes with it. */
  deleteUser(userId: string): Promise<void>
}

/** The tables "Wipe my data" empties, in a safe order. */
export const WIPED_TABLES = USER_TABLES.filter((table) => !KEPT_BY_WIPE.includes(table))

export function handleAccountRequest(deps: () => AccountDeps): (request: Request) => Promise<Response> {
  return handleJson(
    async (request): Promise<AccountDeleteResponse> => {
      const { authenticate, removeFiles, deleteRows, resetProfile, cancelSubscription, deleteUser } = deps()
      const userId = await requireUser(authenticate, request)
      const { mode } = await readBody(request, AccountDeleteRequestSchema)
      try {
        const files = await removeFiles(userId)
        if (mode === 'account') {
          await cancelSubscription?.(userId)
          await deleteUser(userId)
          return { deleted: 'account', files }
        }
        for (const table of WIPED_TABLES) await deleteRows(userId, table)
        await resetProfile(userId)
        return { deleted: 'data', files }
      } catch (error) {
        console.error(`account-delete (${mode}) stopped:`, error)
        throw new AiError(
          503,
          'delete_incomplete',
          "Deleting didn't finish (the server had a problem). Please try again: it carries on with what is left.",
          { cause: error },
        )
      }
    },
    () => deps().env ?? {},
  )
}
