import { adminClient, signedInUser } from '../_shared/admin.ts'
import { AiError } from '../_shared/aiCore.ts'
import { handleAccountExport, type ExportTable, type ExportUserMeta } from './handler.ts'

const PAGE_SIZE = 1000
const MAX_PAGES = 100

Deno.serve(
  handleAccountExport(() => {
    const env = Deno.env.toObject()
    const admin = adminClient(env)
    return {
      env,
      authenticate: (request) => signedInUser(admin, request),
      async getUser(userId: string): Promise<ExportUserMeta> {
        const { data, error } = await admin.auth.admin.getUserById(userId)
        if (error || !data.user) {
          return { id: userId, email: null, name: 'Ekagra Student' }
        }
        const meta = data.user.user_metadata as Record<string, unknown> | undefined
        const name =
          typeof meta?.full_name === 'string' && meta.full_name.trim()
            ? meta.full_name.trim()
            : typeof meta?.name === 'string' && meta.name.trim()
              ? meta.name.trim()
              : (data.user.email ?? 'Ekagra Student')
        return {
          id: userId,
          email: data.user.email ?? null,
          name,
        }
      },
      async readTable(userId: string, table: ExportTable): Promise<unknown[]> {
        const rows: unknown[] = []
        const column = table === 'profiles' ? 'id' : 'user_id'
        for (let page = 0; page < MAX_PAGES; page++) {
          const from = page * PAGE_SIZE
          const { data, error } = await admin
            .from(table)
            .select('*')
            .eq(column, userId)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, from + PAGE_SIZE - 1)
          if (error) {
            if (error.code === 'PGRST205') return rows
            throw new Error(error.message)
          }
          rows.push(...(data as unknown[]))
          if (data.length < PAGE_SIZE) return rows
        }
        throw new AiError(413, 'export_too_large', `Your ${table} table exceeds the single-file export ceiling.`)
      },
    }
  }),
)
