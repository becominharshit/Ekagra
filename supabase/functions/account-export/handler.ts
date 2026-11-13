import { AiError } from '../_shared/aiCore.ts'
import { handleJson, requireUser } from '../_shared/respond.ts'
import type { AccountExportResponse } from '../_shared/schemas.ts'
import { USER_TABLES, type UserTable } from '../_shared/userTables.ts'

export type ExportTable = 'profiles' | UserTable

/** Profile first, then parent tables before child tables (reverse of deletion order). */
export const EXPORT_ORDER: ExportTable[] = ['profiles', ...[...USER_TABLES].reverse()]

const FILES_NOTE =
  "PDFs and feedback screenshots aren't inside this file. Where they're stored is in materials.storage_path and feedback.screenshot_path; open a PDF from the Library to save it."

const PARALLEL = 4

export interface ExportUserMeta {
  id: string
  email: string | null
  name: string
}

export interface AccountExportDeps {
  env?: Record<string, string | undefined>
  authenticate(request: Request): Promise<string | null>
  getUser(userId: string): Promise<ExportUserMeta>
  readTable(userId: string, table: ExportTable): Promise<unknown[]>
  now?: () => Date
}

export function handleAccountExport(deps: () => AccountExportDeps): (request: Request) => Promise<Response> {
  return handleJson(
    async (request): Promise<AccountExportResponse> => {
      const { authenticate, getUser, readTable, now = () => new Date() } = deps()
      const userId = await requireUser(authenticate, request)

      try {
        const user = await getUser(userId)
        const tables: Record<string, unknown[]> = {}
        const queue = [...EXPORT_ORDER]

        const worker = async () => {
          for (let table = queue.shift(); table; table = queue.shift()) {
            tables[table] = await readTable(userId, table)
          }
        }
        await Promise.all(Array.from({ length: PARALLEL }, worker))

        const orderedTables: Record<string, unknown[]> = {}
        const counts: Record<string, number> = {}
        for (const table of EXPORT_ORDER) {
          const rows = tables[table] ?? []
          orderedTables[table] = rows
          counts[table] = rows.length
        }

        return {
          app: 'Ekagra',
          format: 1,
          exportedAt: now().toISOString(),
          mode: 'signed_in',
          user,
          note: FILES_NOTE,
          counts,
          tables: orderedTables,
        }
      } catch (error) {
        if (error instanceof AiError) throw error
        console.error('account-export stopped:', error)
        throw new AiError(
          503,
          'export_incomplete',
          "Exporting didn't finish (the server had a problem). Please try again.",
          { cause: error },
        )
      }
    },
    () => deps().env ?? {},
  )
}
