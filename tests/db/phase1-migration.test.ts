import { readFileSync } from 'node:fs'
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GLOBAL_SYSTEM_TABLES, KEPT_BY_WIPE, PROFILE_RESET, USER_TABLES } from '../../supabase/functions/_shared/userTables.ts'

const GLOBAL_TABLE_SET = new Set<string>(GLOBAL_SYSTEM_TABLES)

// Runs the real Phase 1 migration inside PGlite (a small Postgres that runs inside Node:
// nothing to install, no internet) and checks the security rules with two users, Alice and Bob.
// supabase-stubs.sql adds tiny stand-ins for the parts of Supabase the migration uses.

const readSql = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CAROL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' // signed up before the migration ran
const DAN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' // signs up for the social tests

let db: PGlite
let tables: string[] = [] // every table in the "public" schema
const alice = { subject: '', topic: '', material: '', hustle: '', client: '', habit: '', group: '' }

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
  for (const table of tables) {
    if (GLOBAL_TABLE_SET.has(table)) continue
    counts[table] = await count(tx, table)
  }
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
  // Carol signed in (e.g. while testing Google sign-in) before the tables existed.
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${CAROL}', 'carol@example.com', '{"name": "Carol"}')`)
  await db.exec(readSql('../../supabase/migrations/001_phase1_core.sql'))
  await db.exec(readSql('../../supabase/migrations/002_hustle_mode.sql'))
  await db.exec(readSql('../../supabase/migrations/003_beta.sql'))
  await db.exec(readSql('../../supabase/migrations/004_attendance_grades.sql'))
  await db.exec(readSql('../../supabase/migrations/005_adaptive.sql'))
  await db.exec(readSql('../../supabase/migrations/006_weekly_review.sql'))
  await db.exec(readSql('../../supabase/migrations/007_life.sql'))
  await db.exec(readSql('../../supabase/migrations/008_social.sql'))
  await db.exec(readSql('../../supabase/migrations/009_studio.sql'))
  await db.exec(readSql('../../supabase/migrations/010_billing.sql'))
  await db.exec(readSql('../../supabase/migrations/011_analytics.sql'))
  await db.exec(readSql('../../supabase/migrations/012_coding_languages.sql'))
  await db.exec(readSql('../../supabase/migrations/013_mistakes_fsrs.sql'))
  await db.exec(readSql('../../supabase/migrations/014_social_safety.sql'))

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
    // Notes she made in Ekagra Studio from the textbook.
    await insertId(
      tx,
      `insert into public.notes (subject_id, topic_id, material_id, title, content, source) values ($1, $2, $3, 'Normal forms', '# Normal forms', 'material')`,
      [alice.subject, alice.topic, alice.material],
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
    await insertId(tx, `insert into public.feedback (kind, message, screen) values ('bug', 'The timer froze', 'Focus')`)
    await insertId(tx, `insert into public.attendance (subject_id, date, start_time, status) values ($1, '2026-11-02', '09:00', 'present')`, [
      alice.subject,
    ])
    await insertId(tx, `insert into public.marks (subject_id, assessment, max_marks, obtained) values ($1, 'Internal 1', 30, 24)`, [alice.subject])
    await insertId(tx, `insert into public.semester_results (semester, sgpa, credits) values (1, 8.2, 22)`)
    await insertId(tx, `insert into public.subject_ratings (subject_id, rating, attempts_count) values ($1, 1040, 3)`, [alice.subject])
    await insertId(tx, `insert into public.metric_snapshots (week_start, memory, focus_minutes) values ('2026-10-26', 0.9, 120)`)
    await insertId(tx, `insert into public.challenges (week_start, metric, baseline, target) values ('2026-11-02', 'memory', 0.85, 0.9)`)
    await insertId(tx, `insert into public.weekly_reviews (week_start, insights) values ('2026-11-02', '["Mornings went best."]')`)
    alice.habit = await insertId(tx, `insert into public.habits (title, kind, target, unit) values ('Drink water', 'water', 8, 'glasses')`)
    await insertId(tx, `insert into public.habit_logs (habit_id, date, value) values ($1, '2026-11-02', 6)`, [alice.habit])
    await insertId(tx, `insert into public.workouts (date, title, program, day_key) values ('2026-11-02', 'Hostel A', 'hostel', 'A')`)
    await insertId(tx, `insert into public.meals (meal, description, calories, source) values ('lunch', 'Mess thali', 650, 'preset')`)
    await insertId(tx, `insert into public.sleep_logs (date, bed_at, wake_at, minutes) values ('2026-11-02', '2026-11-01 23:30+05:30', '2026-11-02 07:00+05:30', 450)`)
    await insertId(tx, `insert into public.step_counts (date, steps) values ('2026-11-02', 6400)`)
    await insertId(tx, `insert into public.speaking_sessions (scenario, prompt, duration_sec) values ('interview', 'Tell me about yourself.', 75)`)
    await insertId(tx, `insert into public.shared_stats (display_name, focus_minutes, streak_days) values ('Alice', 120, 3)`)
    await insertId(tx, `insert into public.partner_invites default values`)
    alice.group = await insertId(tx, `insert into public.study_groups (name) values ('DBMS circle')`)
    await insertId(tx, `insert into public.group_sessions (group_id, mode, minutes, ends_at) values ($1, 'pomodoro', 25, now() + interval '25 minutes')`, [alice.group])
  })

  // Alice and Carol become partners with Carol's code, and Alice nudges her.
  const carolCode = await as(CAROL, async (tx) => (await tx.query<{ code: string }>('insert into public.partner_invites default values returning code')).rows[0]?.code ?? '')
  await as(ALICE, async (tx) => {
    await tx.query('select public.accept_partner_invite($1)', [carolCode])
    await insertId(tx, `insert into public.nudges (to_user_id, kind) values ($1, 'cheer')`, [CAROL])
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

  it('also creates profiles for people who signed up before the migration ran', async () => {
    const rows = await as(CAROL, async (tx) => (await tx.query('select full_name from public.profiles')).rows)
    expect(rows).toEqual([{ full_name: 'Carol' }])
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
    for (const name of [...tables, 'hustle_earnings', 'shared_stats_view']) {
      await expect(as(null, (tx) => tx.query(`select 1 from public.${name} limit 1`)), name).rejects.toThrow(/permission denied/)
    }
  })

  it("hides Alice's rows from Bob, and Bob can't change or delete them", async () => {
    const aliceBefore = await as(ALICE, countAll)
    expect(aliceBefore).toMatchObject({ subjects: 1, topics: 2, ai_anchors: 1, hustles: 1, transactions: 3, time_entries: 2, feedback: 1 })

    await as(BOB, async (tx) => {
      for (const table of tables) {
        if (table === 'profiles' || GLOBAL_TABLE_SET.has(table)) continue // checked separately
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

  it('saves onboarding the way the app does: a new routine replaces the old one, then the profile', async () => {
    // Like src/features/profile/queries.ts: rows are sent without user_id (the database fills it in),
    // the new routine is saved before the old one is deleted, and the profile goes last.
    const insertRoutine = (classTitle: string) =>
      `insert into public.routine_blocks (kind, title, days_of_week, start_time, end_time) values
         ('sleep', 'Sleep', '{0,1,2,3,4,5,6}', '23:00', '07:00'),
         ('class', '${classTitle}', '{1,2,3,4,5}', '09:00', '16:00')`

    await as(BOB, async (tx) => {
      await tx.exec(insertRoutine('Classes')) // first onboarding
      const old = await tx.query<{ id: string }>('select id from public.routine_blocks where user_id = $1', [BOB])
      await tx.exec(insertRoutine('Lectures')) // edited later
      await tx.query('delete from public.routine_blocks where id = any($1::uuid[])', [`{${old.rows.map((row) => row.id).join(',')}}`])

      const { rows } = await tx.query(
        'select kind, title, days_of_week, start_time, end_time from public.routine_blocks where user_id = $1 order by start_time',
        [BOB],
      )
      expect(rows).toEqual([
        { kind: 'class', title: 'Lectures', days_of_week: [1, 2, 3, 4, 5], start_time: '09:00:00', end_time: '16:00:00' },
        { kind: 'sleep', title: 'Sleep', days_of_week: [0, 1, 2, 3, 4, 5, 6], start_time: '23:00:00', end_time: '07:00:00' },
      ])

      const settings = { budget: { academics: 60, hustle: 20, life: 20 }, planner: { peakStart: '18:00', peakEnd: '22:00' } }
      const updated = await tx.query(
        `update public.profiles
            set full_name = 'Bob', year = 2, semester = 3, chronotype = 'night', mentor_tone = 'strict',
                timezone = 'Asia/Calcutta', settings = $2::jsonb, onboarded_at = now()
          where id = $1`,
        [BOB, JSON.stringify(settings)],
      )
      expect(updated.affectedRows).toBe(1)
    })

    // Values the app never sends are refused by the database too.
    await expect(
      as(BOB, (tx) => tx.query(`update public.profiles set chronotype = 'owl' where id = $1`, [BOB])),
    ).rejects.toThrow(/check constraint/)
    await expect(
      as(BOB, (tx) => tx.query(`insert into public.routine_blocks (kind, title, days_of_week, start_time, end_time) values ('nap', 'Nap', '{0}', '14:00', '15:00')`)),
    ).rejects.toThrow(/check constraint/)
    // Nobody else sees Bob's routine.
    expect(await as(ALICE, (tx) => count(tx, 'routine_blocks'))).toBe(0)
  })

  it('saves a roadmap the way the app does: one insert for units and topics, an upsert for changes', async () => {
    // Like src/features/academics/roadmap.ts: ids are made in the app so links can be sent together.
    const subject = 'dddddddd-0000-4000-8000-000000000001'
    const unit = 'dddddddd-0000-4000-8000-000000000002'
    const er = 'dddddddd-0000-4000-8000-000000000003'
    const sql = 'dddddddd-0000-4000-8000-000000000004'
    await as(BOB, async (tx) => {
      await tx.query(`insert into public.subjects (id, name) values ($1, 'DBMS')`, [subject])
      // The unit and the topics inside it arrive in the same request.
      await tx.query(
        `insert into public.topics (id, subject_id, parent_id, title, order_index, est_minutes) values
           ($1, $2, null, 'Unit 1', 0, null), ($3, $2, $1, 'ER model', 0, 90), ($4, $2, $1, 'SQL', 1, 120)`,
        [unit, subject, er, sql],
      )
      await tx.query(`insert into public.topic_prereqs (topic_id, prereq_topic_id) values ($1, $2)`, [sql, er])
      // Changed values of whole rows in one request (what supabase-js upsert sends).
      await tx.query(
        `insert into public.topics (id, subject_id, parent_id, title, order_index, priority_score, pyq_count)
         values ($1, $2, $3, 'SQL queries', 1, 0.9, 2)
         on conflict (id) do update set title = excluded.title, priority_score = excluded.priority_score, pyq_count = excluded.pyq_count`,
        [sql, subject, unit],
      )
      const { rows } = await tx.query('select title, priority_score, pyq_count from public.topics where id = $1', [sql])
      expect(rows).toEqual([{ title: 'SQL queries', priority_score: '0.9000', pyq_count: 2 }])

      // Deleting the unit deletes its topics and their links too.
      await tx.query('delete from public.topics where id = $1', [unit])
      expect(await count(tx, 'topics')).toBe(0)
      expect(await count(tx, 'topic_prereqs')).toBe(0)
    })

    // Alice can't put her topic into Bob's subject.
    await expect(
      as(ALICE, (tx) => tx.query(`insert into public.topics (subject_id, title) values ($1, 'Sneaky')`, [subject])),
    ).rejects.toThrow()
  })
})

describe('Hustle mode migration (002_hustle_mode.sql)', () => {
  it('accepts part-time / tutoring hustles, and still rejects unknown types', async () => {
    await as(BOB, async (tx) => {
      const id = await insertId(tx, `insert into public.hustles (type, name) values ('parttime', 'Maths tutoring')`)
      const { rows } = await tx.query('select type, links from public.hustles where id = $1', [id])
      expect(rows).toEqual([{ type: 'parttime', links: [] }])
      await tx.query('delete from public.hustles where id = $1', [id])
    })
    await expect(as(BOB, (tx) => tx.query(`insert into public.hustles (type, name) values ('crypto', 'Trading')`))).rejects.toThrow(/hustles_type_check/)
  })

  it('keeps links as a list', async () => {
    await as(BOB, async (tx) => {
      const id = await insertId(
        tx,
        `insert into public.hustles (type, name, links) values ('content', 'Study vlogs', '[{"label": "YouTube", "url": "https://youtube.com/@me"}]')`,
      )
      const { rows } = await tx.query('select links from public.hustles where id = $1', [id])
      expect(rows).toEqual([{ links: [{ label: 'YouTube', url: 'https://youtube.com/@me' }] }])
      await tx.query('delete from public.hustles where id = $1', [id])
    })
    await expect(as(BOB, (tx) => tx.query(`insert into public.hustles (type, name, links) values ('content', 'Vlogs', '{"url": "x"}')`))).rejects.toThrow(
      /hustles_links_is_list/,
    )
  })
})

describe('Beta migration (003_beta.sql): feedback', () => {
  it('saves feedback with the screen it was sent from; it starts as "new"', async () => {
    const rows = await as(BOB, async (tx) => {
      await tx.query(
        `insert into public.feedback (kind, message, screen, path, context) values ('idea', 'Add dark mode', 'Me', '/me', '{"app": "web"}')`,
      )
      return (await tx.query('select kind, message, screen, path, screenshot_path, context, status from public.feedback')).rows
    })
    expect(rows).toEqual([
      { kind: 'idea', message: 'Add dark mode', screen: 'Me', path: '/me', screenshot_path: null, context: { app: 'web' }, status: 'new' },
    ])
  })

  it("doesn't let students change feedback or fake its status; the founder (dashboard) can", async () => {
    await expect(as(ALICE, (tx) => tx.query(`update public.feedback set status = 'fixed'`))).resolves.toMatchObject({ affectedRows: 0 })
    await expect(
      as(ALICE, (tx) => tx.query(`insert into public.feedback (kind, message, status) values ('bug', 'Fixed already?', 'fixed')`)),
    ).rejects.toThrow(/row-level security/)

    // The dashboard's Table Editor skips RLS, like the service role.
    await db.transaction(async (tx) => {
      await tx.exec('set local role service_role')
      const updated = await tx.query(`update public.feedback set status = 'seen' where user_id = $1`, [ALICE])
      expect(updated.affectedRows).toBe(1)
    })
    const statuses = await as(ALICE, async (tx) => (await tx.query('select status from public.feedback')).rows)
    expect(statuses).toEqual([{ status: 'seen' }])
  })

  it('rejects empty messages, unknown kinds and device details that are not an object', async () => {
    const insert = (values: string) => as(BOB, (tx) => tx.query(`insert into public.feedback (kind, message, context) values ${values}`))
    await expect(insert(`('bug', '   ', '{}')`)).rejects.toThrow(/check constraint/)
    await expect(insert(`('rant', 'Too many notifications', '{}')`)).rejects.toThrow(/check constraint/)
    await expect(insert(`('bug', 'Crash', '[]')`)).rejects.toThrow(/check constraint/)
    await expect(insert(`('bug', '${'x'.repeat(4001)}', '{}')`)).rejects.toThrow(/check constraint/)
  })

  it("keeps screenshots in the student's own folder of the images bucket", async () => {
    await as(ALICE, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('images', $1)`, [`${ALICE}/feedback/1.png`]))
    await expect(
      as(ALICE, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('images', $1)`, [`${BOB}/feedback/1.png`])),
    ).rejects.toThrow(/row-level security/)
  })

  it('lets students delete their own feedback, and deleting an account deletes it too', async () => {
    const deleted = await as(BOB, (tx) => tx.query('delete from public.feedback'))
    expect(deleted.affectedRows).toBe(1)

    await as(CAROL, (tx) => tx.query(`insert into public.feedback (kind, message) values ('other', 'Hi!')`))
    await db.query('delete from auth.users where id = $1', [CAROL])
    const { rows } = await db.query<{ n: number }>('select count(*)::int as n from public.feedback where user_id = $1', [CAROL])
    expect(rows[0]?.n).toBe(0)
  })
})

describe('Attendance and grades migration (004_attendance_grades.sql)', () => {
  it('links a class block to its subject; deleting the subject keeps the block, without the link', async () => {
    await as(BOB, async (tx) => {
      const subject = await insertId(tx, `insert into public.subjects (name) values ('Physics')`)
      const block = await insertId(
        tx,
        `insert into public.routine_blocks (kind, title, days_of_week, start_time, end_time, subject_id) values ('class', 'Physics', '{1,3}', '10:00', '11:00', $1)`,
        [subject],
      )
      await tx.query('delete from public.subjects where id = $1', [subject])
      const { rows } = await tx.query('select title, subject_id from public.routine_blocks where id = $1', [block])
      expect(rows).toEqual([{ title: 'Physics', subject_id: null }])
      await tx.query('delete from public.routine_blocks where id = $1', [block])
    })
  })

  it('keeps one row per class from the routine (marking again changes it); classes added by hand can repeat', async () => {
    await as(BOB, async (tx) => {
      const subject = await insertId(tx, `insert into public.subjects (name, credits, grade) values ('Chemistry', 4, 'A+')`)
      const mark = (status: string) =>
        tx.query(
          `insert into public.attendance (subject_id, date, start_time, status) values ($1, '2026-11-04', '09:00', $2)
           on conflict (user_id, subject_id, date, start_time) do update set status = excluded.status`,
          [subject, status],
        )
      await mark('present')
      await mark('absent')
      await tx.query(`insert into public.attendance (subject_id, date, status) values ($1, '2026-11-04', 'present'), ($1, '2026-11-04', 'present')`, [subject])
      const { rows } = await tx.query<{ status: string; start_time: string | null }>(
        'select status, start_time from public.attendance where subject_id = $1 order by start_time nulls last',
        [subject],
      )
      expect(rows).toEqual([
        { status: 'absent', start_time: '09:00:00' },
        { status: 'present', start_time: null },
        { status: 'present', start_time: null },
      ])
      const credits = await tx.query('select credits::float8 as credits, grade from public.subjects where id = $1', [subject])
      expect(credits.rows).toEqual([{ credits: 4, grade: 'A+' }])
    })
  })

  it('rejects unknown statuses, marks above the maximum and impossible SGPAs; one result per semester', async () => {
    const bob = (sql: string) => as(BOB, (tx) => tx.query(sql))
    const subject = await as(BOB, (tx) => insertId(tx, `insert into public.subjects (name) values ('Biology')`))
    await expect(bob(`insert into public.attendance (subject_id, date, status) values ('${subject}', '2026-11-04', 'late')`)).rejects.toThrow(/check constraint/)
    await expect(bob(`insert into public.marks (subject_id, assessment, max_marks, obtained) values ('${subject}', 'Quiz', 10, 11)`)).rejects.toThrow(
      /check constraint/,
    )
    await expect(bob(`insert into public.semester_results (semester, sgpa, credits) values (2, 10.5, 20)`)).rejects.toThrow(/check constraint/)
    await bob(`insert into public.semester_results (semester, sgpa, credits) values (2, 7.9, 20)`)
    await expect(bob(`insert into public.semester_results (semester, sgpa, credits) values (2, 8.1, 20)`)).rejects.toThrow(/duplicate key/)
  })

  it("stops Bob from adding attendance or marks to Alice's subject", async () => {
    await expect(
      as(BOB, (tx) => tx.query(`insert into public.attendance (subject_id, date, status) values ($1, '2026-11-04', 'present')`, [alice.subject])),
    ).rejects.toThrow(/foreign key/)
    await expect(
      as(BOB, (tx) => tx.query(`insert into public.marks (subject_id, assessment, max_marks, obtained) values ($1, 'Quiz', 10, 5)`, [alice.subject])),
    ).rejects.toThrow(/foreign key/)
  })
})

describe('Adaptive practice migration (005_adaptive.sql)', () => {
  it('keeps one rating per subject (starting at 1000), deleted with the subject', async () => {
    await as(BOB, async (tx) => {
      const subject = await insertId(tx, `insert into public.subjects (name) values ('Statistics')`)
      const { rows } = await tx.query<{ rating: string; attempts_count: number }>(
        `insert into public.subject_ratings (subject_id) values ($1) returning rating, attempts_count`,
        [subject],
      )
      expect(rows).toEqual([{ rating: '1000.0', attempts_count: 0 }])
      await expect(tx.query(`insert into public.subject_ratings (subject_id) values ($1)`, [subject])).rejects.toThrow(/duplicate key/)
    })
    await as(BOB, async (tx) => {
      const subject = await insertId(tx, `insert into public.subjects (name) values ('Economics')`)
      await tx.query(`insert into public.subject_ratings (subject_id, rating) values ($1, 1100)`, [subject])
      await tx.query('delete from public.subjects where id = $1', [subject])
      const { rows } = await tx.query('select 1 from public.subject_ratings where subject_id = $1', [subject])
      expect(rows).toEqual([])
    })
  })

  it('records when a topic was learned', async () => {
    await as(BOB, async (tx) => {
      const subject = await insertId(tx, `insert into public.subjects (name) values ('Algorithms')`)
      const topic = await insertId(tx, `insert into public.topics (subject_id, title) values ($1, 'Sorting')`, [subject])
      await tx.query(`update public.topics set status = 'review', learned_at = '2026-11-02T10:00:00Z' where id = $1`, [topic])
      const { rows } = await tx.query<{ learned: boolean }>('select learned_at is not null as learned from public.topics where id = $1', [topic])
      expect(rows).toEqual([{ learned: true }])
    })
  })

  it('keeps one snapshot and one challenge per week, with metrics in range', async () => {
    const bob = (sql: string) => as(BOB, (tx) => tx.query(sql))
    await bob(`insert into public.metric_snapshots (week_start, memory, problem_solving) values ('2026-11-02', 0.8, 0.5)`)
    await expect(bob(`insert into public.metric_snapshots (week_start) values ('2026-11-02')`)).rejects.toThrow(/duplicate key/)
    await expect(bob(`insert into public.metric_snapshots (week_start, memory) values ('2026-11-09', 1.5)`)).rejects.toThrow(/check constraint/)
    await expect(bob(`insert into public.metric_snapshots (week_start, details) values ('2026-11-09', '[]')`)).rejects.toThrow(/check constraint/)
    await bob(`insert into public.challenges (week_start, metric, target) values ('2026-11-02', 'problem_solving', 0.55)`)
    await expect(bob(`insert into public.challenges (week_start, metric, target) values ('2026-11-09', 'iq', 1)`)).rejects.toThrow(/check constraint/)
  })

  it("stops Bob from rating himself on Alice's subject", async () => {
    await expect(as(BOB, (tx) => tx.query(`insert into public.subject_ratings (subject_id) values ($1)`, [alice.subject]))).rejects.toThrow(/foreign key/)
  })
})

describe('Weekly review migration (006_weekly_review.sql)', () => {
  it('keeps one review per week, written by the AI or the device', async () => {
    const bob = (sql: string) => as(BOB, (tx) => tx.query(sql))
    await bob(`insert into public.weekly_reviews (week_start, source, model) values ('2026-11-02', 'ai', 'smart-model')`)
    await expect(bob(`insert into public.weekly_reviews (week_start) values ('2026-11-02')`)).rejects.toThrow(/duplicate key/)
    await expect(bob(`insert into public.weekly_reviews (week_start, source) values ('2026-11-09', 'friend')`)).rejects.toThrow(/check constraint/)
    await expect(bob(`insert into public.weekly_reviews (week_start, changes) values ('2026-11-09', '{}')`)).rejects.toThrow(/check constraint/)
    const { rows } = await as(BOB, (tx) => tx.query(`select stats, insights, changes, completed_at from public.weekly_reviews where week_start = '2026-11-02'`))
    expect(rows).toEqual([{ stats: {}, insights: [], changes: [], completed_at: null }])
  })
})

describe('Life migration (007_life.sql)', () => {
  it('keeps one log per habit and day, deleted with the habit', async () => {
    await as(BOB, async (tx) => {
      const habit = await insertId(tx, `insert into public.habits (title) values ('Stretch')`)
      await tx.query(`insert into public.habit_logs (habit_id, date, done) values ($1, '2026-11-02', true)`, [habit])
      await expect(tx.query(`insert into public.habit_logs (habit_id, date) values ($1, '2026-11-02')`, [habit])).rejects.toThrow(/duplicate key/)
    })
    await as(BOB, async (tx) => {
      const habit = await insertId(tx, `insert into public.habits (title, days_of_week) values ('Run', '{1,3,5}')`)
      await tx.query(`insert into public.habit_logs (habit_id, date, done) values ($1, '2026-11-02', true)`, [habit])
      await tx.query('delete from public.habits where id = $1', [habit])
      const { rows } = await tx.query('select 1 from public.habit_logs where habit_id = $1', [habit])
      expect(rows).toEqual([])
    })
  })

  it('rejects impossible values: unknown days, waking before bed, too many steps, unknown kinds', async () => {
    const bob = (sql: string) => as(BOB, (tx) => tx.query(sql))
    await expect(bob(`insert into public.habits (title, days_of_week) values ('Bad', '{7}')`)).rejects.toThrow(/check constraint/)
    await expect(bob(`insert into public.habits (title, days_of_week) values ('None', '{}')`)).rejects.toThrow(/check constraint/)
    await expect(bob(`insert into public.sleep_logs (date, bed_at, wake_at, minutes) values ('2026-11-02', '2026-11-02 07:00+00', '2026-11-01 23:00+00', 480)`)).rejects.toThrow(/check constraint/)
    await expect(bob(`insert into public.step_counts (date, steps) values ('2026-11-02', 500000)`)).rejects.toThrow(/check constraint/)
    await expect(bob(`insert into public.meals (meal, description) values ('brunch', 'Eggs')`)).rejects.toThrow(/check constraint/)
    await expect(bob(`insert into public.speaking_sessions (scenario, prompt, duration_sec) values ('karaoke', 'Sing', 30)`)).rejects.toThrow(/check constraint/)
    await expect(bob(`insert into public.workouts (date, title, program) values ('2026-11-02', 'Yoga', 'yoga')`)).rejects.toThrow(/check constraint/)
  })

  it('keeps one sleep and step count per day for each source (typed in, or from Health Connect)', async () => {
    const bob = (sql: string) => as(BOB, (tx) => tx.query(sql))
    await bob(`insert into public.step_counts (date, steps) values ('2026-11-03', 5000)`)
    await bob(`insert into public.step_counts (date, steps, source) values ('2026-11-03', 5600, 'health_connect')`)
    await expect(bob(`insert into public.step_counts (date, steps, source) values ('2026-11-03', 5700, 'health_connect')`)).rejects.toThrow(/duplicate key/)
  })

  it("stops Bob from logging Alice's habit", async () => {
    await expect(as(BOB, (tx) => tx.query(`insert into public.habit_logs (habit_id, date) values ($1, '2026-11-02')`, [alice.habit]))).rejects.toThrow(/foreign key/)
  })
})

describe('Social migration (008_social.sql)', () => {
  // Carol's account was deleted above (taking her partner link with Alice with it), so Dan signs up.
  beforeAll(async () => {
    await db.exec(`insert into auth.users (id, email) values ('${DAN}', 'dan@example.com')`)
  })

  const statsSeenBy = async (viewer: string) =>
    as(viewer, async (tx) => (await tx.query<{ user_id: string; display_name: string }>('select user_id, display_name from public.shared_stats_view order by display_name')).rows.map((row) => row.display_name))

  it('only stores the numbers a student chose to share', async () => {
    const bob = (sql: string) => as(BOB, (tx) => tx.query(sql))
    await expect(bob(`insert into public.shared_stats (display_name, share_plan, plan_pct) values ('Bob', false, 50)`)).rejects.toThrow(/check constraint/)
    await expect(bob(`insert into public.shared_stats (display_name, share_focus, on_leaderboard) values ('Bob', false, true)`)).rejects.toThrow(/check constraint/)
    await bob(`insert into public.shared_stats (display_name, focus_minutes, streak_days, studying_until) values ('Bob', 90, 2, now() + interval '30 minutes')`)
    expect(await statsSeenBy(BOB)).toEqual(['Bob'])
    // Alice isn't connected to Bob.
    expect(await statsSeenBy(ALICE)).toEqual(['Alice'])
  })

  it('makes partners from a code (both ways, once), who then see each other’s numbers', async () => {
    const code = await as(BOB, async (tx) => (await tx.query<{ code: string }>('insert into public.partner_invites default values returning code')).rows[0]?.code ?? '')
    expect(code).toMatch(/^[0-9A-F]{10}$/)
    await expect(as(BOB, (tx) => tx.query('select public.accept_partner_invite($1)', [code]))).rejects.toThrow(/your own code/)
    await expect(as(DAN, (tx) => tx.query('select public.accept_partner_invite($1)', ['NOPE000000']))).rejects.toThrow(/wrong or has expired/)
    const { rows } = await as(DAN, (tx) => tx.query<{ partner: string }>('select public.accept_partner_invite($1) as partner', [` ${code.toLowerCase()} `]))
    expect(rows).toEqual([{ partner: BOB }])
    await expect(as(ALICE, (tx) => tx.query('select public.accept_partner_invite($1)', [code]))).rejects.toThrow(/wrong or has expired/) // used up

    expect(await statsSeenBy(DAN)).toEqual(['Bob'])
    const studying = await as(DAN, async (tx) => (await tx.query('select studying_now from public.shared_stats_view where user_id = $1', [BOB])).rows)
    expect(studying).toEqual([{ studying_now: true }])
    // Removing either row ends the partnership both ways.
    await as(BOB, (tx) => tx.query('delete from public.partner_links where partner_id = $1', [DAN]))
    expect(await statsSeenBy(DAN)).toEqual([])
    expect(await as(DAN, (tx) => count(tx, 'partner_links'))).toBe(0)
    // Carol's account was deleted: her partner link with Alice and Alice's nudge to her went with it.
    expect(await as(ALICE, async (tx) => [await count(tx, 'partner_links'), await count(tx, 'nudges')])).toEqual([0, 0])
  })

  it('lets students join a group with its code; members see each other, others see nothing', async () => {
    const group = await as(BOB, (tx) => insertId(tx, `insert into public.study_groups (name) values ('Maths gang')`))
    const code = await as(BOB, async (tx) => (await tx.query<{ invite_code: string; role: string }>('select g.invite_code, m.role from public.study_groups g join public.group_members m on m.group_id = g.id where g.id = $1', [group])).rows[0])
    expect(code?.role).toBe('owner')
    await expect(as(DAN, (tx) => tx.query('select public.join_group($1)', ['NOPE000000']))).rejects.toThrow(/No group has that code/)
    await as(DAN, (tx) => tx.query('select public.join_group($1)', [code?.invite_code]))
    await expect(as(DAN, (tx) => tx.query('select public.join_group($1)', [code?.invite_code]))).rejects.toThrow(/already in that group/)

    expect(await as(DAN, (tx) => count(tx, 'group_members'))).toBe(2) // Bob and Dan (he isn't in Alice's group)
    expect(await statsSeenBy(DAN)).toEqual(['Bob'])
    const outsider = await as(ALICE, (tx) => tx.query('select 1 from public.study_groups where id = $1', [group]))
    expect(outsider.rows).toEqual([])
    await expect(as(BOB, (tx) => tx.query('insert into public.group_members (group_id, user_id) values ($1, $2)', [alice.group, BOB]))).rejects.toThrow(/row-level security/)
  })

  it('keeps group focus and nudges among connected students, at most 3 nudges a day', async () => {
    const group = await as(BOB, async (tx) => (await tx.query<{ id: string }>(`select id from public.study_groups where name = 'Maths gang'`)).rows[0]?.id)
    await as(DAN, (tx) => insertId(tx, `insert into public.group_sessions (group_id, mode, minutes, ends_at) values ($1, 'deep', 50, now() + interval '50 minutes')`, [group]))
    expect(await as(BOB, (tx) => count(tx, 'group_sessions'))).toBe(1)
    await expect(as(ALICE, (tx) => tx.query(`insert into public.group_sessions (group_id, mode, minutes, ends_at) values ($1, 'deep', 50, now() + interval '1 hour')`, [group]))).rejects.toThrow(/row-level security/)

    const nudge = () => as(DAN, (tx) => insertId(tx, `insert into public.nudges (to_user_id, kind, message) values ($1, 'study', 'Time to study!')`, [BOB]))
    const first = await nudge()
    await nudge()
    await nudge()
    await expect(nudge()).rejects.toThrow(/3 times a day/)
    await expect(as(ALICE, (tx) => tx.query(`insert into public.nudges (to_user_id, kind) values ($1, 'study')`, [BOB]))).rejects.toThrow(/row-level security/)

    // Bob marks it seen, but can't change what it says.
    const seen = await as(BOB, (tx) => tx.query('update public.nudges set seen_at = now() where id = $1', [first]))
    expect(seen.affectedRows).toBe(1)
    await expect(as(BOB, (tx) => tx.query(`update public.nudges set message = 'Fake' where id = $1`, [first]))).rejects.toThrow(/permission denied/)
  })

  it('hands a group to the member who joined first when the owner leaves; the last one out deletes it', async () => {
    const group = await as(BOB, async (tx) => (await tx.query<{ id: string }>(`select id from public.study_groups where name = 'Maths gang'`)).rows[0]?.id)
    await as(BOB, (tx) => tx.query('select public.leave_group($1)', [group]))
    const owner = await as(DAN, async (tx) => (await tx.query('select g.user_id, m.role from public.study_groups g join public.group_members m on m.group_id = g.id where g.id = $1', [group])).rows)
    expect(owner).toEqual([{ user_id: DAN, role: 'owner' }])
    await expect(as(BOB, (tx) => tx.query('select public.leave_group($1)', [group]))).rejects.toThrow(/not in that group/)
    await as(DAN, (tx) => tx.query('select public.leave_group($1)', [group]))
    const left = await db.query('select 1 from public.study_groups where id = $1', [group])
    expect(left.rows).toEqual([])
  })

  it('stops showing "studying now" once it has ended', async () => {
    await as(BOB, (tx) => tx.query(`update public.shared_stats set studying_until = now() - interval '1 minute'`))
    const rows = await as(BOB, async (tx) => (await tx.query('select studying_now, studying_until from public.shared_stats_view')).rows)
    expect(rows).toEqual([{ studying_now: false, studying_until: null }])
  })
})

describe('Studio migration (009_studio.sql): notes', () => {
  it('starts a note as ready Markdown notes written by hand', async () => {
    const rows = await as(BOB, async (tx) => {
      const subject = await insertId(tx, `insert into public.subjects (name) values ('Electronics')`)
      const note = await insertId(tx, `insert into public.notes (subject_id, title) values ($1, 'Diodes')`, [subject])
      return (await tx.query('select kind, content, source, status, error, topic_id, material_id from public.notes where id = $1', [note])).rows
    })
    expect(rows).toEqual([{ kind: 'notes', content: '', source: 'manual', status: 'ready', error: null, topic_id: null, material_id: null }])
  })

  it('deletes notes with their subject; deleting the topic or material only clears the link', async () => {
    await as(BOB, async (tx) => {
      const subject = await insertId(tx, `insert into public.subjects (name) values ('Networks')`)
      const topic = await insertId(tx, `insert into public.topics (subject_id, title) values ($1, 'TCP')`, [subject])
      const video = await insertId(tx, `insert into public.materials (subject_id, kind, title, source_url) values ($1, 'youtube', 'TCP in 10 minutes', 'https://www.youtube.com/watch?v=abc')`, [subject])
      const note = await insertId(
        tx,
        `insert into public.notes (subject_id, topic_id, material_id, kind, title, source, status) values ($1, $2, $3, 'revision_sheet', 'TCP', 'youtube', 'processing')`,
        [subject, topic, video],
      )
      await tx.query('delete from public.topics where id = $1', [topic])
      await tx.query('delete from public.materials where id = $1', [video])
      const { rows } = await tx.query('select title, topic_id, material_id from public.notes where id = $1', [note])
      expect(rows).toEqual([{ title: 'TCP', topic_id: null, material_id: null }])
      await tx.query('delete from public.subjects where id = $1', [subject])
      expect((await tx.query('select 1 from public.notes where id = $1', [note])).rows).toEqual([])
    })
  })

  it('rejects unknown kinds, sources and statuses, and empty titles', async () => {
    const subject = await as(BOB, (tx) => insertId(tx, `insert into public.subjects (name) values ('Optics')`))
    const insert = (columns: string, values: string) => as(BOB, (tx) => tx.query(`insert into public.notes (subject_id, ${columns}) values ($1, ${values})`, [subject]))
    await expect(insert('title, kind', `'Lenses', 'flowchart'`)).rejects.toThrow(/check constraint/)
    await expect(insert('title, source', `'Lenses', 'scraped'`)).rejects.toThrow(/check constraint/)
    await expect(insert('title, status', `'Lenses', 'done'`)).rejects.toThrow(/check constraint/)
    await expect(insert('title', `'   '`)).rejects.toThrow(/check constraint/)
    await expect(as(BOB, (tx) => tx.query(`insert into public.notes (title) values ('No subject')`))).rejects.toThrow(/not-null/)
  })

  it("stops Bob from filing notes under Alice's subject, topic or material", async () => {
    const subject = await as(BOB, (tx) => insertId(tx, `insert into public.subjects (name) values ('Thermodynamics')`))
    const note = (columns: string, params: string[]) =>
      as(BOB, (tx) => tx.query(`insert into public.notes (title, ${columns}) values ('Sneaky', ${params.map((_, i) => `$${i + 1}`).join(', ')})`, params))
    await expect(note('subject_id', [alice.subject])).rejects.toThrow(/foreign key/)
    await expect(note('subject_id, topic_id', [subject, alice.topic])).rejects.toThrow(/foreign key/)
    await expect(note('subject_id, material_id', [subject, alice.material])).rejects.toThrow(/foreign key/)
  })
})

describe('Billing migration (010_billing.sql)', () => {
  it('seeds free, pro, and campus plan_entitlements as read-only for authenticated users', async () => {
    const rows = await as(BOB, async (tx) =>
      (await tx.query<{ plan_tier: string; daily_ai_requests: number }>('select plan_tier, daily_ai_requests from public.plan_entitlements order by daily_ai_requests')).rows,
    )
    expect(rows.map((r) => r.plan_tier)).toEqual(['free', 'pro', 'campus'])
    await expect(
      as(BOB, (tx) => tx.query(`insert into public.plan_entitlements (plan_tier, daily_ai_requests, monthly_ai_tokens, max_studio_sources) values ('free', 9999, 100, 1)`)),
    ).rejects.toThrow(/row-level security|permission denied/)
    const updated = await as(BOB, (tx) => tx.query(`update public.plan_entitlements set daily_ai_requests = 9999`))
    expect(updated.affectedRows ?? 0).toBe(0)
  })

  it('lets users read only their own subscription, and restricts writes + webhook_events to service_role', async () => {
    await db.transaction(async (tx) => {
      await tx.exec('set local role service_role')
      await tx.query(
        `insert into public.subscriptions (user_id, provider, customer_id, subscription_id, plan_tier, status)
         values ($1, 'stripe', 'cus_alice', 'sub_alice', 'pro', 'active')`,
        [ALICE],
      )
      await tx.query(
        `insert into public.webhook_events (provider, event_id, event_type, status, payload)
         values ('stripe', 'evt_1', 'checkout.session.completed', 'processed', '{"tier":"pro"}')`,
      )
    })

    const aliceSubs = await as(ALICE, async (tx) => (await tx.query<{ plan_tier: string }>('select plan_tier from public.subscriptions')).rows)
    expect(aliceSubs).toEqual([{ plan_tier: 'pro' }])

    const bobSubs = await as(BOB, async (tx) => (await tx.query('select * from public.subscriptions')).rows)
    expect(bobSubs).toEqual([])

    await expect(
      as(BOB, (tx) => tx.query(`insert into public.subscriptions (user_id, provider, plan_tier, status) values ($1, 'stripe', 'pro', 'active')`, [BOB])),
    ).rejects.toThrow(/row-level security|permission denied/)

    await expect(as(BOB, (tx) => tx.query('select * from public.webhook_events'))).rejects.toThrow(/permission denied/)
    await expect(
      db.transaction(async (tx) => {
        await tx.exec('set local role service_role')
        await tx.query(`insert into public.webhook_events (provider, event_id, event_type) values ('stripe', 'evt_1', 'duplicate')`)
      }),
    ).rejects.toThrow(/unique constraint|duplicate key/)
  })
})

describe('Analytics migration (011_analytics.sql)', () => {
  it('enforces strict RLS on analytics_events (users only read/insert their own events)', async () => {
    await as(ALICE, (tx) =>
      tx.query(`insert into public.analytics_events (event_name, app_surface, properties) values ('study_session_started', 'web', '{"minutes":25}')`),
    )
    expect(await as(ALICE, (tx) => count(tx, 'analytics_events'))).toBe(1)
    expect(await as(BOB, (tx) => count(tx, 'analytics_events'))).toBe(0)

    await expect(
      as(BOB, (tx) =>
        tx.query(`insert into public.analytics_events (user_id, event_name) values ($1, 'spoofed')`, [ALICE]),
      ),
    ).rejects.toThrow(/row-level security/)
  })
})

describe('Phase 4 Coding Lab multi-language migration (012_coding_languages.sql)', () => {
  it('allows python, javascript, typescript, and sql while rejecting unsupported languages', async () => {
    for (const lang of ['python', 'javascript', 'typescript', 'sql']) {
      await as(ALICE, (tx) =>
        tx.query(`insert into public.code_snippets (title, language, code) values ($1, $2, $3)`, [`Test ${lang}`, lang, '// ok']),
      )
    }
    const aliceCount = await as(ALICE, async (tx) => {
      const { rows } = await tx.query<{ n: number }>(`select count(*)::int as n from public.code_snippets`)
      return rows[0]?.n ?? 0
    })
    expect(aliceCount).toBeGreaterThanOrEqual(4)
    expect(await as(BOB, (tx) => count(tx, 'code_snippets'))).toBe(0)

    await expect(
      as(ALICE, (tx) =>
        tx.query(`insert into public.code_snippets (title, language, code) values ('Invalid', 'cobol', 'STOP RUN.')`),
      ),
    ).rejects.toThrow(/code_snippets_language_check/)
  })
})

describe('Phase 6 FSRS mistakes migration (013_mistakes_fsrs.sql)', () => {
  it('stores FSRS JSON state on mistakes, enforces object check constraint, and preserves RLS', async () => {
    const id = await as(ALICE, (tx) =>
      insertId(tx, `insert into public.mistakes (concept, fsrs) values ('FSRS state', '{"state":2,"stability":4.2}'::jsonb)`),
    )
    const rows = await as(ALICE, async (tx) => (await tx.query<{ fsrs: Record<string, unknown> }>('select fsrs from public.mistakes where id = $1', [id])).rows)
    expect(rows[0]?.fsrs).toEqual({ state: 2, stability: 4.2 })

    expect(await as(BOB, (tx) => count(tx, 'mistakes'))).toBe(0)

    await expect(
      as(ALICE, (tx) => tx.query(`insert into public.mistakes (concept, fsrs) values ('Bad', '[1,2]'::jsonb)`)),
    ).rejects.toThrow(/mistakes_fsrs_object_check/)
  })
})

describe('Phase 6 Social Safety migration (014_social_safety.sql)', () => {
  it('blocks a user (dissolving partner links + nudges), enforces mutual block checks on invites and groups, and unblocks cleanly', async () => {
    const code = await as(BOB, async (tx) => (await tx.query<{ code: string }>('insert into public.partner_invites default values returning code')).rows[0]?.code ?? '')
    await as(DAN, (tx) => tx.query('select public.accept_partner_invite($1)', [code]))
    expect(await as(BOB, (tx) => count(tx, 'partner_links'))).toBe(1)

    await as(BOB, (tx) => tx.query(`insert into public.nudges (to_user_id, kind) values ($1, 'cheer')`, [DAN]))
    expect(await as(DAN, (tx) => count(tx, 'nudges'))).toBeGreaterThanOrEqual(1)

    // Bob blocks Dan -> dissolves partner_links both ways + cleans direct nudges + sets is_connected = false.
    await as(BOB, (tx) => tx.query(`insert into public.blocked_users (blocked_user_id, reason) values ($1, 'Spamming invites')`, [DAN]))
    expect(await as(BOB, (tx) => count(tx, 'partner_links'))).toBe(0)
    expect(await as(DAN, (tx) => count(tx, 'partner_links'))).toBe(0)
    expect(await as(BOB, (tx) => count(tx, 'nudges'))).toBe(0)
    expect(
      await as(BOB, async (tx) => (await tx.query<{ ok: boolean }>('select public.is_connected($1) as ok', [DAN])).rows[0]?.ok),
    ).toBe(false)

    // Dan cannot accept a new partner invite from Bob or join a group Bob owns while blocked.
    const nextCode = await as(BOB, async (tx) => (await tx.query<{ code: string }>('insert into public.partner_invites default values returning code')).rows[0]?.code ?? '')
    await expect(as(DAN, (tx) => tx.query('select public.accept_partner_invite($1)', [nextCode]))).rejects.toThrow(/cannot be accepted/i)
    await expect(as(DAN, (tx) => tx.query('select public.accept_partner_invite($1)', ['bad']))).rejects.toThrow(/valid invite code/i)

    const groupId = await as(BOB, (tx) => insertId(tx, `insert into public.study_groups (name) values ('Safety Check Group')`))
    const gCode = await as(BOB, async (tx) => (await tx.query<{ invite_code: string }>('select invite_code from public.study_groups where id = $1', [groupId])).rows[0]?.invite_code ?? '')
    await expect(as(DAN, (tx) => tx.query('select public.join_group($1)', [gCode]))).rejects.toThrow(/unavailable/i)

    // Unblocking restores clean state (and clean up temp group).
    await as(BOB, (tx) => tx.query('delete from public.blocked_users where blocked_user_id = $1', [DAN]))
    await as(BOB, (tx) => tx.query('select public.leave_group($1)', [groupId]))
  })

  it('stores abuse reports with strict RLS (cannot self-report, cannot read others reports, cannot mutate moderation status)', async () => {
    await as(BOB, (tx) =>
      tx.query(
        `insert into public.abuse_reports (reported_user_id, category, context_type, details) values ($1, 'spam', 'partner', 'Repeated unwanted links')`,
        [DAN],
      ),
    )
    expect(await as(BOB, (tx) => count(tx, 'abuse_reports'))).toBe(1)
    expect(await as(DAN, (tx) => count(tx, 'abuse_reports'))).toBe(0)

    await expect(
      as(BOB, (tx) => tx.query(`insert into public.abuse_reports (reported_user_id, category) values ($1, 'harassment')`, [BOB])),
    ).rejects.toThrow(/check constraint|row-level security/)

    await expect(
      as(BOB, (tx) => tx.query(`insert into public.abuse_reports (reported_user_id, category) values ($1, 'invalid_cat')`, [DAN])),
    ).rejects.toThrow(/abuse_reports_category_check/)

    // Users cannot self-resolve moderation status (no UPDATE RLS policy for authenticated).
    const res = await as(BOB, (tx) => tx.query(`update public.abuse_reports set status = 'resolved' where reported_user_id = $1`, [DAN]))
    expect(res.affectedRows ?? 0).toBe(0)
  })
})

// These run last: they delete Alice's and Bob's data.
describe('Account controls (account-delete Edge Function)', () => {
  /** Rows of this user in every table. */
  async function rowsOf(userId: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {}
    for (const table of tables) {
      if (GLOBAL_TABLE_SET.has(table)) continue
      const column = table === 'profiles' ? 'id' : 'user_id'
      const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.${table} where ${column} = $1`, [userId])
      if ((rows[0]?.n ?? 0) > 0) counts[table] = rows[0]?.n ?? 0
    }
    return counts
  }

  it('knows every table that holds student rows (a new table must be added to _shared/userTables.ts)', () => {
    expect([...USER_TABLES].sort()).toEqual(tables.filter((table) => table !== 'profiles' && !GLOBAL_TABLE_SET.has(table)).sort())
  })

  it("wipes a student's data table by table in that order, keeps AI usage + subscriptions and resets the profile", async () => {
    expect(Object.keys(await rowsOf(ALICE)).length).toBeGreaterThan(15)
    // Like the Edge Function: the secret key (service role) deletes one table after another.
    await db.transaction(async (tx) => {
      await tx.exec('set local role service_role')
      for (const table of USER_TABLES) {
        if (!KEPT_BY_WIPE.includes(table)) await tx.query(`delete from public.${table} where user_id = $1`, [ALICE])
      }
      const reset = Object.entries(PROFILE_RESET)
      await tx.query(`update public.profiles set ${reset.map(([column], index) => `${column} = $${index + 2}`).join(', ')} where id = $1`, [
        ALICE,
        ...reset.map(([, value]) => (value !== null && typeof value === 'object' ? JSON.stringify(value) : value)),
      ])
    })

    expect(await rowsOf(ALICE)).toEqual({ ai_usage: 1, profiles: 1, subscriptions: 1 })
    const profile = await as(ALICE, async (tx) => (await tx.query('select full_name, onboarded_at, settings, chronotype from public.profiles')).rows)
    expect(profile).toEqual([{ full_name: 'Alice', onboarded_at: null, settings: {}, chronotype: 'neutral' }])
  })

  it("deletes every row of a student when the sign-in account is deleted while keeping webhook audit events", async () => {
    await db.transaction(async (tx) => {
      await tx.exec('set local role service_role')
      await tx.query(
        `insert into public.subscriptions (user_id, provider, customer_id, subscription_id, plan_tier, status)
         values ($1, 'razorpay', 'cust_bob', 'sub_bob', 'pro', 'active')`,
        [BOB],
      )
    })
    await as(BOB, async (tx) => {
      const subject = await insertId(tx, `insert into public.subjects (name) values ('Maths')`)
      const topic = await insertId(tx, `insert into public.topics (subject_id, title) values ($1, 'Limits')`, [subject])
      await insertId(tx, `insert into public.flashcards (topic_id, front, back) values ($1, 'Q', 'A')`, [topic])
      const hustle = await insertId(tx, `insert into public.hustles (type, name) values ('parttime', 'Tutoring')`)
      const client = await insertId(tx, `insert into public.clients (hustle_id, name) values ($1, 'Riya')`, [hustle])
      await insertId(tx, `insert into public.transactions (hustle_id, client_id, kind, amount) values ($1, $2, 'income', 500)`, [hustle, client])
      const session = await insertId(tx, `insert into public.focus_sessions (area, hustle_id, mode, planned_minutes) values ('hustle', $1, 'deep', 50)`, [hustle])
      await insertId(tx, `insert into public.time_entries (hustle_id, client_id, focus_session_id, started_at, minutes) values ($1, $2, $3, now(), 50)`, [hustle, client, session])
      await insertId(tx, `insert into public.feedback (kind, message) values ('idea', 'Dark mode')`)
    })
    expect(Object.keys(await rowsOf(BOB)).length).toBeGreaterThan(8)

    // What auth.admin.deleteUser does in the database.
    await db.query('delete from auth.users where id = $1', [BOB])
    expect(await rowsOf(BOB)).toEqual({})
    const events = await db.query<{ n: number }>(`select count(*)::int as n from public.webhook_events`)
    expect(events.rows[0]?.n).toBe(1)
  })
})
