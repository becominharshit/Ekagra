import { describe, expect, it, vi } from 'vitest'
import { AccountExportResponseSchema } from '../_shared/schemas.ts'
import { USER_TABLES } from '../_shared/userTables.ts'
import { EXPORT_ORDER, handleAccountExport, type AccountExportDeps } from './handler.ts'

const NOW = new Date('2026-11-13T10:00:00.000Z')

function makeDeps(overrides: Partial<AccountExportDeps> = {}): () => AccountExportDeps {
  return () => ({
    env: { ALLOWED_ORIGINS: 'https://ekagra.app' },
    authenticate: async (request) => (request.headers.get('Authorization') === 'Bearer valid-jwt' ? 'user-123' : null),
    getUser: async (userId) => ({ id: userId, email: 'student@ekagra.app', name: 'Asha' }),
    readTable: async (_userId, table) => {
      if (table === 'profiles') return [{ id: 'user-123', full_name: 'Asha' }]
      if (table === 'subjects') return [{ id: 'sub-1', name: 'Algorithms' }]
      if (table === 'subscriptions') return [{ id: 'subsc-1', plan_tier: 'pro' }]
      return []
    },
    now: () => NOW,
    ...overrides,
  })
}

function post(token = 'valid-jwt', origin = 'https://ekagra.app'): Request {
  return new Request('http://localhost/functions/v1/account-export', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })
}

describe('account-export', () => {
  it('exports profile + every user table in parent-before-child order with strict CORS', async () => {
    const response = await handleAccountExport(makeDeps())(post())
    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://ekagra.app')

    const parsed = AccountExportResponseSchema.parse(await response.json())
    expect(parsed.app).toBe('Ekagra')
    expect(parsed.format).toBe(1)
    expect(parsed.mode).toBe('signed_in')
    expect(parsed.exportedAt).toBe(NOW.toISOString())
    expect(parsed.user).toEqual({ id: 'user-123', email: 'student@ekagra.app', name: 'Asha' })
    expect(Object.keys(parsed.tables)).toEqual(['profiles', ...[...USER_TABLES].reverse()])
    expect(Object.keys(parsed.tables)).toEqual(EXPORT_ORDER)
    expect(parsed.counts).toMatchObject({ profiles: 1, subjects: 1, subscriptions: 1, flashcards: 0 })
  })

  it('rejects unauthenticated requests with 401 and blocked CORS origins on OPTIONS with 403', async () => {
    const unauth = await handleAccountExport(makeDeps())(post('bad-jwt'))
    expect(unauth.status).toBe(401)

    const preflight = await handleAccountExport(makeDeps())(
      new Request('http://localhost/functions/v1/account-export', {
        method: 'OPTIONS',
        headers: { Origin: 'https://evil.example' },
      }),
    )
    expect(preflight.status).toBe(403)
  })

  it('returns 503 export_incomplete without leaking raw DB errors on server failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await handleAccountExport(
      makeDeps({
        readTable: async (_userId, table) => {
          if (table === 'flashcards') throw new Error('internal postgres socket timeout')
          return []
        },
      }),
    )(post())

    expect(response.status).toBe(503)
    const body = (await response.json()) as { code: string; message: string }
    expect(body.code).toBe('export_incomplete')
    expect(body.message).not.toContain('socket timeout')
    vi.restoreAllMocks()
  })
})
