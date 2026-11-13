import { describe, expect, it, vi } from 'vitest'
import { AccountDeleteResponseSchema } from '../_shared/schemas.ts'
import { KEPT_BY_WIPE, USER_TABLES } from '../_shared/userTables.ts'
import { handleAccountRequest, WIPED_TABLES, type AccountDeps } from './handler.ts'
import { removeUserFiles } from './storage.ts'

/** Fake deps that write down what was deleted, in order. */
function deps(overrides: Partial<AccountDeps> = {}) {
  const done: string[] = []
  const make = (): AccountDeps => ({
    authenticate: async (request) => (request.headers.get('Authorization') === 'Bearer good-token' ? 'student-1' : null),
    removeFiles: async (userId) => {
      done.push(`files of ${userId}`)
      return 3
    },
    deleteRows: async (userId, table) => {
      done.push(`${table} of ${userId}`)
    },
    resetProfile: async (userId) => {
      done.push(`profile of ${userId} reset`)
    },
    cancelSubscription: async (userId) => {
      done.push(`subscription of ${userId} canceled`)
    },
    deleteUser: async (userId) => {
      done.push(`account ${userId}`)
    },
    ...overrides,
  })
  return { make, done }
}

function post(body: unknown, token = 'good-token'): Request {
  return new Request('http://localhost/functions/v1/account-delete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('account-delete', () => {
  it('wipes the files, then every table children first, then resets the profile; AI usage and subscriptions stay', async () => {
    const { make, done } = deps()
    const response = await handleAccountRequest(make)(post({ mode: 'data', confirm: 'DELETE' }))
    expect(response.status).toBe(200)
    expect(AccountDeleteResponseSchema.parse(await response.json())).toEqual({ deleted: 'data', files: 3 })
    expect(done).toEqual(['files of student-1', ...WIPED_TABLES.map((table) => `${table} of student-1`), 'profile of student-1 reset'])
    expect(WIPED_TABLES).not.toContain('ai_usage')
    expect(WIPED_TABLES).not.toContain('subscriptions')
    expect(WIPED_TABLES).toHaveLength(USER_TABLES.length - KEPT_BY_WIPE.length)
  })

  it('deletes the files, cancels active billing, then deletes the account (the rows go with it)', async () => {
    const { make, done } = deps()
    const response = await handleAccountRequest(make)(post({ mode: 'account', confirm: 'DELETE' }))
    expect(AccountDeleteResponseSchema.parse(await response.json())).toEqual({ deleted: 'account', files: 3 })
    expect(done).toEqual(['files of student-1', 'subscription of student-1 canceled', 'account student-1'])
  })

  it('needs a sign-in and the typed confirmation, and deletes nothing without them', async () => {
    const { make, done } = deps()
    expect((await handleAccountRequest(make)(post({ mode: 'account', confirm: 'DELETE' }, 'stolen-token'))).status).toBe(401)
    expect((await handleAccountRequest(make)(post({ mode: 'account', confirm: 'delete' }))).status).toBe(400)
    expect((await handleAccountRequest(make)(post({ mode: 'everything', confirm: 'DELETE' }))).status).toBe(400)
    expect(done).toEqual([])
  })

  it('says to try again when the server stops halfway, without the details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { make, done } = deps({
      deleteRows: async (_userId, table) => {
        if (table === 'flashcards') throw new Error('connection reset by peer')
        done.push(table)
      },
    })
    const response = await handleAccountRequest(make)(post({ mode: 'data', confirm: 'DELETE' }))
    expect(response.status).toBe(503)
    const body: { code: string; message: string } = await response.json()
    expect(body).toMatchObject({ code: 'delete_incomplete', message: expect.stringContaining('try again') })
    expect(body.message).not.toContain('connection reset')
    expect(done).not.toContain('profile of student-1 reset')
    vi.restoreAllMocks()
  })
})

describe('removeUserFiles', () => {
  it("lists the student's folders in both buckets (with the folders inside) and removes every file", async () => {
    const files: Record<string, string[]> = {
      materials: ['u1/a.pdf', 'u1/b.pdf'],
      images: ['u1/feedback/1.png', 'u1/feedback/2.jpg', 'u1/other.webp'],
    }
    const removed: string[] = []
    const client = {
      storage: {
        from: (bucket: string) => ({
          // Like Supabase: one level at a time; folders have no id.
          list: async (folder: string) => {
            const inside = (files[bucket] ?? []).filter((path) => path.startsWith(`${folder}/`)).map((path) => path.slice(folder.length + 1))
            const names = [...new Set(inside.map((rest) => rest.split('/')[0] ?? ''))]
            return { data: names.map((name) => ({ name, id: inside.includes(name) ? `id-${name}` : null })), error: null }
          },
          remove: async (paths: string[]) => {
            removed.push(...paths.map((path) => `${bucket}:${path}`))
            return { data: [], error: null }
          },
        }),
      },
    }
    await expect(removeUserFiles(client as never, 'u1')).resolves.toBe(5)
    expect(removed.sort()).toEqual(['images:u1/feedback/1.png', 'images:u1/feedback/2.jpg', 'images:u1/other.webp', 'materials:u1/a.pdf', 'materials:u1/b.pdf'])
  })
})
