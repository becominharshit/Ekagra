import { describe, expect, it } from 'vitest'
import { USER_TABLES } from '@shared/userTables.ts'
import { DEMO_USER } from '@/features/auth/demo'
import { useFocusStore } from '@/features/focus/focusStore'
import { useLaunchpadStore } from '@/features/hustle/launchpadStore'
import { demoProfileRepo } from '@/features/profile/localStore'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { buildExport, forgetOnDevice, type DataExport } from './account'

stubLocalStorage()

const NOW = new Date(2026, 10, 20, 10, 0)

/** Just enough of a signed-in Supabase client to read tables a page at a time. */
function fakeSupabase(tables: Record<string, unknown[]>, { missing = [] as string[], broken = [] as string[] } = {}) {
  const asked: { table: string; column: string; value: string; from: number }[] = []
  const client = {
    from: (table: string) => {
      let column = ''
      let value = ''
      const query = {
        select: () => query,
        eq: (name: string, id: string) => {
          column = name
          value = id
          return query
        },
        order: () => query,
        range: async (from: number, to: number) => {
          asked.push({ table, column, value, from })
          if (missing.includes(table)) return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}'` } }
          if (broken.includes(table)) return { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }
          return { data: (tables[table] ?? []).slice(from, to + 1), error: null }
        },
      }
      return query
    },
  }
  return { source: { kind: 'supabase', userId: 'student-1', client } as unknown as DataSource, asked }
}

describe('buildExport', () => {
  it('puts every table of the signed-in student in one JSON file, the profile first', async () => {
    const subjects = Array.from({ length: 1500 }, (_, index) => ({ id: `s${index}`, name: `Subject ${index}` }))
    const { source, asked } = fakeSupabase({ profiles: [{ id: 'student-1', full_name: 'Asha' }], subjects, tasks: [{ id: 't1' }] }, { missing: ['feedback'] })
    const progress: number[] = []
    const file = await buildExport(source, { id: 'student-1', email: 'asha@example.com', name: 'Asha', avatarUrl: null, isDemo: false }, {
      now: NOW,
      onProgress: (done) => progress.push(done),
    })

    expect(file.name).toBe('ekagra-export-2026-11-20.json')
    expect(file.rows).toBe(1502)
    const data = JSON.parse(file.json) as DataExport
    expect(data).toMatchObject({ app: 'Ekagra', format: 1, mode: 'signed_in', user: { id: 'student-1', email: 'asha@example.com', name: 'Asha' } })
    expect(data.exportedAt).toBe(NOW.toISOString())
    expect(Object.keys(data.tables)).toEqual(['profiles', ...[...USER_TABLES].reverse()])
    expect(data.counts).toMatchObject({ profiles: 1, subjects: 1500, tasks: 1, feedback: 0, ai_usage: 0 })
    expect(data.tables.subjects).toHaveLength(1500)

    // Only the student's own rows: the profile by id, everything else by user_id; 1,500 subjects take 2 pages.
    expect(asked.find((call) => call.table === 'profiles')).toMatchObject({ column: 'id', value: 'student-1' })
    expect(asked.filter((call) => call.table !== 'profiles').every((call) => call.column === 'user_id' && call.value === 'student-1')).toBe(true)
    expect(asked.filter((call) => call.table === 'subjects').map((call) => call.from)).toEqual([0, 1000])
    expect(progress.at(-1)).toBe(USER_TABLES.length + 1)
  })

  it("stops with the database's message when a table can't be read", async () => {
    const { source } = fakeSupabase({}, { broken: ['tasks'] })
    await expect(buildExport(source, null, { now: NOW })).rejects.toThrow('canceling statement due to statement timeout')
  })

  it("exports Demo Mode's data from this device", async () => {
    await demoProfileRepo.saveProfile({ full_name: 'Demo Student', onboarded_at: '2026-11-01T00:00:00.000Z' })
    await demoProfileRepo.replaceRoutine([{ kind: 'class', title: 'Classes', days_of_week: [1, 2, 3, 4, 5], start_time: '09:00', end_time: '16:00' }])
    demoDb.insert('subjects', [{ name: 'DBMS' }])
    demoDb.insert('feedback', [{ kind: 'idea', message: 'Dark mode' }])

    const file = await buildExport({ kind: 'demo' }, DEMO_USER, { now: NOW })
    const data = JSON.parse(file.json) as DataExport
    expect(data.mode).toBe('demo')
    expect(Object.keys(data.tables)[0]).toBe('profiles')
    expect(data.counts).toMatchObject({ profiles: 1, routine_blocks: 1, subjects: 1, feedback: 1, topics: 0 })
    expect(data.tables.profiles).toEqual([expect.objectContaining({ full_name: 'Demo Student' })])
    expect(data.tables).not.toHaveProperty('ai_usage') // Demo Mode has no AI usage
  })
})

describe('forgetOnDevice', () => {
  it("removes this app's caches and running timers from the device, and keeps everything else", async () => {
    localStorage.setItem('ekagra-brief:student-1', '{}')
    localStorage.setItem('ekagra-plan-run:student-1', '{}')
    localStorage.setItem('ekagra-pdf-page:m1', '12')
    localStorage.setItem('ekagra-mock:student-1:dbms', '{}')
    localStorage.setItem('some-other-site', 'keep')
    useFocusStore.setState({ pauses: { s1: [] }, pass: { until: '2026-11-20T10:03:00.000Z', app: 'Instagram' } })
    useLaunchpadStore.setState({ active: { hustleId: 'h1', platform: 'Upwork', startedAt: NOW.toISOString(), minutes: 10 } as never })

    await forgetOnDevice()

    expect(localStorage.getItem('ekagra-brief:student-1')).toBeNull()
    expect(localStorage.getItem('ekagra-plan-run:student-1')).toBeNull()
    expect(localStorage.getItem('ekagra-pdf-page:m1')).toBeNull()
    expect(localStorage.getItem('ekagra-mock:student-1:dbms')).toBeNull()
    expect(localStorage.getItem('some-other-site')).toBe('keep')
    expect(useFocusStore.getState()).toMatchObject({ pauses: {}, pass: null })
    expect(useLaunchpadStore.getState().active).toBeNull()
  })
})
