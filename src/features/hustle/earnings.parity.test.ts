import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import migration from '../../../supabase/migrations/001_phase1_core.sql?raw'
import hustleMigration from '../../../supabase/migrations/002_hustle_mode.sql?raw'
import supabaseStubs from '../../../tests/db/supabase-stubs.sql?raw'
import { earnings } from './earnings'

// The app works out earnings per hour itself (so it also works per client, per month and in Demo
// Mode). This checks that it gives the same numbers as the database's hustle_earnings view.

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(supabaseStubs)
  await db.exec(migration)
  await db.exec(hustleMigration)
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${USER}', 'student@example.com', '{}')`)
})

afterAll(async () => {
  await db?.close()
})

interface Case {
  name: string
  money: { kind: 'income' | 'expense'; amount: number }[]
  minutes: number[]
}

const CASES: Case[] = [
  { name: 'the spec example', money: [{ kind: 'income', amount: 6000 }, { kind: 'income', amount: 500 }, { kind: 'expense', amount: 500 }], minutes: [1500, 900] },
  { name: 'paise and odd minutes', money: [{ kind: 'income', amount: 1234.56 }, { kind: 'expense', amount: 100.1 }], minutes: [77] },
  { name: 'a loss', money: [{ kind: 'expense', amount: 799 }], minutes: [45, 30] },
  { name: 'no time yet', money: [{ kind: 'income', amount: 300 }], minutes: [] },
]

describe('earnings match the hustle_earnings view', () => {
  for (const testCase of CASES) {
    it(testCase.name, async () => {
      const view = await db.transaction(async (tx) => {
        await tx.exec('set local role authenticated')
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [USER])
        const { rows } = await tx.query<{ id: string }>(`insert into public.hustles (type, name) values ('freelancing', $1) returning id`, [testCase.name])
        const hustle = rows[0]?.id
        for (const { kind, amount } of testCase.money) {
          await tx.query('insert into public.transactions (hustle_id, kind, amount) values ($1, $2, $3)', [hustle, kind, amount])
        }
        for (const minutes of testCase.minutes) {
          await tx.query(`insert into public.time_entries (hustle_id, started_at, minutes) values ($1, now(), $2)`, [hustle, minutes])
        }
        const result = await tx.query<Record<string, string | number | null>>('select * from public.hustle_earnings where hustle_id = $1', [hustle])
        return result.rows[0]
      })

      const app = earnings(testCase.money, testCase.minutes.map((minutes) => ({ minutes })))
      const number = (value: string | number | null | undefined) => (value === null || value === undefined ? null : Number(value))
      expect({
        income: number(view?.income),
        expense: number(view?.expense),
        net: number(view?.net_profit),
        minutes: number(view?.minutes_logged),
        perHour: number(view?.earnings_per_hour),
      }).toEqual(app)
    })
  }
})
