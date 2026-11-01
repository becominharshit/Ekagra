import { readFileSync } from 'node:fs'
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Runs the real Phase 1 migration inside PGlite (a small Postgres that runs inside Node:
// nothing to install, no internet) and checks the security rules with two users, Alice and Bob.
// supabase-stubs.sql adds tiny stand-ins for the parts of Supabase the migration uses.

const readSql = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

let db: PGlite
let tables: string[] = [] // every table in the "public" schema
const alice = { subject: '', topic: '', material: '', hustle: '', client: '' }

/** Run queries as a signed-in user (like the app does through Supabase). `null` = signed out. */
function as<T>(userId: string | null, run: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${userId ? 'authenticated' : 'anon'}`)
    if (userId) await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId])
    return run(tx)
  })
}

async function count(tx: Transaction, table: string): Promise<number> {
  const { rows } = await tx.query<{ n: number }>(`select count(*)::int as n from public.${table}`)
  return rows[0]?.n ?? 0
}

async function countAll(tx: Transaction): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const table of tables) counts[table] = await count(tx, table)
  return counts
}

async function insertId(tx: Transaction, insert: string, params: unknown[] = []): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(`${insert} returning id`, params)
  const id = rows[0]?.id
  if (!id) throw new Error(`Insert returned no id: ${insert}`)
  return id
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(readSql('./supabase-stubs.sql'))
  await db.exec(readSql('../../supabase/migrations/001_phase1_core.sql'))

  // Two people sign up. The sign-up trigger creates their profiles.
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${ALICE}', 'alice@example.com', '{"full_name": "Alice", "avatar_url": "https://example.com/alice.png"}'),
      ('${BOB}', 'bob@example.com', '{}');
  `)

  const { rows } = await db.query<{ name: string }>(`
    select c.relname as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by 1`)
  tables = rows.map((row) => row.name)

  // Alice uses the app: academics, an AI anchor, a hustle with money and hours, focus, a task.
  await as(ALICE, async (tx) => {
    alice.subject = await insertId(tx, `insert into public.subjects (name) values ('DBMS')`)
    const unit = await insertId(tx, `insert into public.topics (subject_id, title) values ($1, 'Unit 1')`, [alice.subject])
    alice.topic = await insertId(
      tx,
      `insert into public.topics (subject_id, parent_id, title, track, exam_weight) values ($1, $2, 'Normalization', 'exam', 0.8)`,
      [alice.subject, unit],
    )
    alice.material = await insertId(
      tx,
      `insert into public.materials (subject_id, kind, purpose, title) values ($1, 'pdf', 'study', 'DBMS textbook')`,
      [alice.subject],
    )
    const anchor = await insertId(
      tx,
      `insert into public.ai_anchors (material_id, page_no, action, selected_text, topic_id) values ($1, 12, 'explain', 'BCNF', $2)`,
      [alice.material, alice.topic],
    )
    await insertId(
      tx,
      `insert into public.flashcards (topic_id, anchor_id, front, back, source) values ($1, $2, 'What is BCNF?', 'A stricter form of 3NF', 'anchor')`,
      [alice.topic, anchor],
    )

    alice.hustle = await insertId(
      tx,
      `insert into public.hustles (type, name, pipeline_stages) values ('freelancing', 'Web design', '{lead,active,paid}')`,
    )
    alice.client = await insertId(tx, `insert into public.clients (hustle_id, name) values ($1, 'Cafe owner')`, [alice.hustle])
    const card = await insertId(
      tx,
      `insert into public.hustle_items (hustle_id, title, stage, client_id, amount) values ($1, 'Landing page', 'paid', $2, 6000)`,
      [alice.hustle, alice.client],
    )
    await insertId(
      tx,
      `insert into public.transactions (hustle_id, client_id, hustle_item_id, kind, amount) values ($1, $2, $3, 'income', 6000)`,
      [alice.hustle, alice.client, card],
    )
    await insertId(tx, `insert into public.transactions (hustle_id, kind, amount) values ($1, 'income', 500)`, [alice.hustle])
    await insertId(
      tx,
      `insert into public.transactions (hustle_id, kind, amount, category) values ($1, 'expense', 500, 'Domain name')`,
      [alice.hustle],
    )
    // 1500 + 900 minutes = 40 hours of hustle work
    await insertId(
      tx,
      `insert into public.time_entries (hustle_id, client_id, started_at, minutes) values ($1, $2, now() - interval '2 days', 1500)`,
      [alice.hustle, alice.client],
    )
    await insertId(
      tx,
      `insert into public.time_entries (hustle_id, started_at, minutes) values ($1, now() - interval '1 day', 900)`,
      [alice.hustle],
    )

    const session = await insertId(
      tx,
      `insert into public.focus_sessions (area, subject_id, mode, planned_minutes) values ('academics', $1, 'pomodoro', 25)`,
      [alice.subject],
    )
    await insertId(
      tx,
      `insert into public.distraction_events (focus_session_id, kind, from_mode, to_mode, reason) values ($1, 'mode_switch', 'study', 'hustle', 'urgent')`,
      [session],
    )
    await insertId(
      tx,
      `insert into public.tasks (area, hustle_id, title, source) values ('hustle', $1, 'Send the invoice', 'screenshot')`,
      [alice.hustle],
    )
  })
})

afterAll(async () => {
  await db?.close()
})

describe('Phase 1 migration (001_phase1_core.sql)', () => {
  it('creates a profile with name and photo when someone signs up', async () => {
    const rows = await as(ALICE, async (tx) => (await tx.query('select full_name, avatar_url, timezone from public.profiles')).rows)
    expect(rows).toEqual([{ full_name: 'Alice', avatar_url: 'https://example.com/alice.png', timezone: 'Asia/Kolkata' }])
  })

  it('turns on RLS for every table, each with at least one policy', async () => {
    const { rows } = await db.query<{ name: string; rls: boolean; policies: number }>(`
      select c.relname as name, c.relrowsecurity as rls,
             (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'`)

    expect(rows.filter((row) => !row.rls || row.policies === 0)).toEqual([])
    expect(tables).toEqual(expect.arrayContaining(['hustles', 'hustle_items', 'transactions', 'time_entries', 'ai_anchors']))
  })

  it('gives signed-out visitors no access to any table or view', async () => {
    for (const name of [...tables, 'hustle_earnings']) {
      await expect(as(null, (tx) => tx.query(`select 1 from public.${name} limit 1`)), name).rejects.toThrow(/permission denied/)
    }
  })

  it("hides Alice's rows from Bob, and Bob can't change or delete them", async () => {
    const aliceBefore = await as(ALICE, countAll)
    expect(aliceBefore).toMatchObject({ subjects: 1, topics: 2, ai_anchors: 1, hustles: 1, transactions: 3, time_entries: 2 })

    await as(BOB, async (tx) => {
      for (const table of tables) {
        if (table === 'profiles') continue // checked just below
        expect(await count(tx, table), `Bob reading ${table}`).toBe(0)
        const updated = await tx.query(`update public.${table} set updated_at = now()`)
        expect(updated.affectedRows ?? 0, `Bob updating ${table}`).toBe(0)
        const deleted = await tx.query(`delete from public.${table}`)
        expect(deleted.affectedRows ?? 0, `Bob deleting ${table}`).toBe(0)
      }
      const profiles = await tx.query<{ id: string }>('select id from public.profiles')
      expect(profiles.rows).toEqual([{ id: BOB }])
    })

    expect(await as(ALICE, countAll)).toEqual(aliceBefore)
  })

  it("stops Bob from saving rows in Alice's name", async () => {
    await expect(
      as(BOB, (tx) => tx.query(`insert into public.subjects (user_id, name) values ($1, 'Fake')`, [ALICE])),
    ).rejects.toThrow(/row-level security/)
  })

  it("stops Bob from linking his rows to Alice's rows", async () => {
    await expect(
      as(BOB, (tx) => tx.query(`insert into public.topics (subject_id, title) values ($1, 'Sneaky')`, [alice.subject])),
    ).rejects.toThrow(/foreign key/)
    await expect(
      as(BOB, (tx) => tx.query(`insert into public.transactions (hustle_id, kind, amount) values ($1, 'income', 100)`, [alice.hustle])),
    ).rejects.toThrow(/foreign key/)
    await expect(
      as(BOB, (tx) => tx.query(`insert into public.ai_anchors (material_id, page_no, action) values ($1, 1, 'explain')`, [alice.material])),
    ).rejects.toThrow(/foreign key/)
  })

  it('calculates earnings per hour as net profit ÷ hours logged', async () => {
    const rows = await as(ALICE, async (tx) => {
      const result = await tx.query(
        `select income::float8 as income, expense::float8 as expense, net_profit::float8 as net,
                hours_logged::float8 as hours, earnings_per_hour::float8 as per_hour
         from public.hustle_earnings where hustle_id = $1`,
        [alice.hustle],
      )
      return result.rows
    })
    // (6000 + 500 income − 500 expense) ÷ 40 hours = 150 per hour
    expect(rows).toEqual([{ income: 6500, expense: 500, net: 6000, hours: 40, per_hour: 150 }])

    const bobRows = await as(BOB, async (tx) => (await tx.query('select * from public.hustle_earnings')).rows)
    expect(bobRows).toEqual([])
  })

  it('lets users read, but never write, their AI usage and jobs', async () => {
    // Edge Functions write these with the service role, which skips RLS.
    await db.transaction(async (tx) => {
      await tx.exec('set local role service_role')
      await tx.query(
        `insert into public.ai_usage (user_id, feature, model, input_tokens, output_tokens, cost_usd)
         values ($1, 'ai-generate', 'fast-model', 1200, 300, 0.0004)`,
        [ALICE],
      )
      await tx.query(`insert into public.jobs (user_id, type) values ($1, 'process_pdf')`, [ALICE])
    })

    expect(await as(ALICE, (tx) => count(tx, 'ai_usage'))).toBe(1)
    expect(await as(BOB, (tx) => count(tx, 'ai_usage'))).toBe(0)
    await expect(
      as(ALICE, (tx) => tx.query(`insert into public.ai_usage (user_id, feature, model) values ($1, 'cheat', 'none')`, [ALICE])),
    ).rejects.toThrow(/row-level security/)
    await expect(as(ALICE, (tx) => tx.query('update public.ai_usage set cost_usd = 0'))).resolves.toMatchObject({ affectedRows: 0 })
    await expect(
      as(ALICE, (tx) => tx.query(`insert into public.jobs (user_id, type) values ($1, 'cheat')`, [ALICE])),
    ).rejects.toThrow(/row-level security/)
  })

  it('saves "I Crashed" first and the evening sliders later', async () => {
    await as(ALICE, async (tx) => {
      await tx.query(`insert into public.daily_checkins (date, minimum_day, crashed_at) values ('2026-11-01', true, now())`)
      await tx.query(`update public.daily_checkins set energy = 2, mood = 3, checked_in_at = now() where date = '2026-11-01'`)
      const { rows } = await tx.query('select minimum_day, energy, mood from public.daily_checkins')
      expect(rows).toEqual([{ minimum_day: true, energy: 2, mood: 3 }])
    })

    // Energy without mood is rejected: the sliders are saved together.
    await expect(
      as(ALICE, (tx) => tx.query(`insert into public.daily_checkins (date, energy) values ('2026-11-02', 4)`)),
    ).rejects.toThrow(/check constraint/)
  })

  it('only lets users store files in their own folder', async () => {
    await as(ALICE, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('materials', $1)`, [`${ALICE}/dbms.pdf`]))
    await expect(
      as(ALICE, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('materials', $1)`, [`${BOB}/dbms.pdf`])),
    ).rejects.toThrow(/row-level security/)

    const bobFiles = await as(BOB, async (tx) => (await tx.query('select id from storage.objects')).rows)
    expect(bobFiles).toEqual([])
  })

  it('keeps money records when a client is deleted (only the link is cleared)', async () => {
    await as(ALICE, async (tx) => {
      await tx.query('delete from public.clients where id = $1', [alice.client])
      const { rows } = await tx.query('select count(*)::int as total, count(client_id)::int as linked from public.transactions')
      expect(rows).toEqual([{ total: 3, linked: 0 }])
    })
  })

  it('supports Kanban drag-and-drop order, Coding Lab attempts and the Tollbooth quiz', async () => {
    // Fractional order: a card dropped between positions 1 and 2 is saved at 1.5.
    const titles = await as(ALICE, async (tx) => {
      await tx.query(
        `insert into public.hustle_items (hustle_id, title, stage, order_index)
         values ($1, 'First', 'lead', 1), ($1, 'Second', 'lead', 2), ($1, 'Dropped between', 'lead', 1.5)`,
        [alice.hustle],
      )
      const { rows } = await tx.query<{ title: string }>(
        `select title from public.hustle_items where hustle_id = $1 and stage = 'lead' order by order_index`,
        [alice.hustle],
      )
      return rows.map((row) => row.title)
    })
    expect(titles).toEqual(['First', 'Dropped between', 'Second'])

    // A saved Python Coding Lab attempt, and an Academic Tollbooth quiz.
    await as(ALICE, async (tx) => {
      await tx.query(
        `insert into public.code_snippets (topic_id, code, last_output, passed) values ($1, 'print("hi")', 'hi', true)`,
        [alice.topic],
      )
      await tx.query(`insert into public.quizzes (kind, subject_id) values ('tollbooth', $1)`, [alice.subject])
    })
    await expect(as(ALICE, (tx) => tx.query(`insert into public.quizzes (kind) values ('not-a-kind')`))).rejects.toThrow(
      /check constraint/,
    )
  })
})
