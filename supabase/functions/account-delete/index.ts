import { adminClient, signedInUser } from '../_shared/admin.ts'
import { PROFILE_RESET } from '../_shared/userTables.ts'
import { handleAccountRequest } from './handler.ts'
import { removeUserFiles } from './storage.ts'

Deno.serve(
  handleAccountRequest(() => {
    const admin = adminClient(Deno.env.toObject())
    return {
      authenticate: (request) => signedInUser(admin, request),
      removeFiles: (userId) => removeUserFiles(admin, userId),
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
