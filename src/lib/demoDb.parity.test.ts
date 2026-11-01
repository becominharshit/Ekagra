import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import migration from '../../supabase/migrations/001_phase1_core.sql?raw'
import supabaseStubs from '../../tests/db/supabase-stubs.sql?raw'
import { stubLocalStorage } from '@/test/memoryStorage'
import { DEMO_TABLES, demoDb, type DemoTable } from './demoDb'

// Demo Mode must behave like the real database. This runs the real migration in PGlite (Postgres
// inside Node), makes the same rows in both, and compares them column by column.
// The tests build on each other (insert, then delete), so they share one storage.

stubLocalStorage('file')

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
let db: PGlite

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const SUBJECT = id(1)
const UNIT = id(2)
const TOPIC = id(3)
const MATERIAL = id(4)
const ANCHOR = id(5)
const PAPER = id(6)
const QUESTION = id(7)
const QUIZ = id(8)
const CARD = id(9)
const SNIPPET = id(10)
const TASK = id(17)
const BLOCK = id(18)
const FOCUS = id(20)

// The smallest rows each table accepts (in an order that respects the links), with ids given
// so both databases link the same rows. Columns not listed here get their default.
const ROWS: [DemoTable, Record<string, unknown>][] = [
  ['subjects', { id: SUBJECT, name: 'DBMS' }],
  ['topics', { id: UNIT, subject_id: SUBJECT, title: 'Unit 1' }],
  ['topics', { id: TOPIC, subject_id: SUBJECT, parent_id: UNIT, title: 'SQL' }],
  ['topic_prereqs', { id: id(11), topic_id: TOPIC, prereq_topic_id: UNIT }],
  ['materials', { id: MATERIAL, kind: 'pdf', title: 'Notes' }],
  ['material_pages', { id: id(12), material_id: MATERIAL, page_no: 1 }],
  ['ai_anchors', { id: ANCHOR, material_id: MATERIAL, page_no: 1, action: 'explain', topic_id: TOPIC }],
  ['lessons', { id: id(13), topic_id: TOPIC, content_md: '# SQL' }],
  ['past_papers', { id: PAPER, subject_id: SUBJECT, material_id: MATERIAL }],
  ['questions', { id: QUESTION, source: 'pyq', type: 'short', prompt: 'Define SQL.', past_paper_id: PAPER }],
  ['quizzes', { id: QUIZ, kind: 'check', subject_id: SUBJECT }],
  ['attempts', { id: id(14), question_id: QUESTION, quiz_id: QUIZ }],
  ['flashcards', { id: CARD, front: 'Q', back: 'A', material_id: MATERIAL, anchor_id: ANCHOR }],
  ['flashcard_reviews', { id: id(15), flashcard_id: CARD, rating: 3 }],
  ['code_snippets', { id: SNIPPET, topic_id: TOPIC, question_id: QUESTION }],
  ['mistakes', { id: id(16), concept: 'Joins', topic_id: TOPIC, question_id: QUESTION, flashcard_id: CARD, code_snippet_id: SNIPPET }],
  ['tasks', { id: TASK, title: 'DBMS assignment', subject_id: SUBJECT }],
  [
    'plan_blocks',
    {
      id: BLOCK,
      date: '2026-11-02',
      start_at: '2026-11-02T04:00:00.000Z',
      end_at: '2026-11-02T04:45:00.000Z',
      area: 'academics',
      kind: 'learn',
      title: 'SQL',
      planned_minutes: 45,
      subject_id: SUBJECT,
      topic_id: TOPIC,
      task_id: TASK,
    },
  ],
  ['daily_checkins', { id: id(19), date: '2026-11-02' }],
  ['focus_sessions', { id: FOCUS, area: 'academics', mode: 'custom', planned_minutes: 45, plan_block_id: BLOCK, subject_id: SUBJECT }],
  ['distraction_events', { id: id(21), kind: 'mode_switch', focus_session_id: FOCUS, quiz_id: QUIZ, from_mode: 'study', to_mode: 'hustle', reason: 'urgent' }],
]

/**
 * Columns that hold "now" (or "now + 1 day"), so their values differ by a few milliseconds, and
 * dates and times we set ourselves (Postgres gives them back as Date objects, the demo as text).
 */
const TIME_COLUMNS = new Set(['created_at', 'updated_at', 'started_at', 'due_at', 'reviewed_at', 'next_review_at', 'at', 'date', 'start_at', 'end_at'])

/** Makes Postgres and demo values comparable: the app gets numbers and plain JSON from Supabase. */
function comparable(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [column, value] of Object.entries(row)) {
    if (column === 'user_id' || TIME_COLUMNS.has(column)) continue
    result[column] = typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value
  }
  return result
}

/** Runs SQL as the signed-in test user, the way the app's requests run. */
async function asUser<T>(run: (tx: Parameters<Parameters<PGlite['transaction']>[0]>[0]) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec('set local role authenticated')
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [USER])
    return run(tx)
  })
}

async function postgresRows(table: DemoTable): Promise<Record<string, unknown>[]> {
  return asUser(async (tx) => (await tx.query<Record<string, unknown>>(`select * from public.${table} order by id`)).rows)
}

function demoRows(table: DemoTable): Record<string, unknown>[] {
  return [...(demoDb.list(table) as unknown as Record<string, unknown>[])].sort((a, b) => String(a.id).localeCompare(String(b.id)))
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(supabaseStubs)
  await db.exec(migration)
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${USER}', 'demo@example.com', '{}')`)
})

afterAll(async () => {
  await db?.close()
})

async function insertEverywhere(): Promise<void> {
  for (const [table, values] of ROWS) {
    const columns = Object.keys(values)
    await asUser((tx) =>
      tx.query(
        `insert into public.${table} (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
        Object.values(values),
      ),
    )
    demoDb.insert(table, [values as never])
  }
}

describe('demoDb matches the real database (001_phase1_core.sql)', () => {
  it('has a test row for every demo table', () => {
    expect(new Set(ROWS.map(([table]) => table))).toEqual(new Set(DEMO_TABLES))
  })

  it('creates the same columns with the same defaults', async () => {
    await insertEverywhere()
    for (const table of DEMO_TABLES) {
      const real = (await postgresRows(table)).map(comparable)
      const demo = demoRows(table).map(comparable)
      expect(demo, table).toEqual(real)
    }
  })

  it('fills "now" columns the same way (mistakes come back for review a day later)', () => {
    const [mistake] = demoDb.list('mistakes')
    const hoursAhead = (Date.parse(mistake?.next_review_at ?? '') - Date.now()) / 3_600_000
    expect(hoursAhead).toBeGreaterThan(23.9)
    expect(hoursAhead).toBeLessThanOrEqual(24)
  })

  it('deletes and unlinks the same rows when a subject and a material are deleted', async () => {
    await asUser(async (tx) => {
      await tx.query('delete from public.subjects where id = $1', [SUBJECT])
      await tx.query('delete from public.materials where id = $1', [MATERIAL])
    })
    demoDb.remove('subjects', [SUBJECT])
    demoDb.remove('materials', [MATERIAL])

    for (const table of DEMO_TABLES) {
      const real = (await postgresRows(table)).map(comparable)
      const demo = demoRows(table).map(comparable)
      expect(demo, table).toEqual(real)
    }
  })
})
