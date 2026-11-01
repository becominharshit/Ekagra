import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import migration from '../../supabase/migrations/001_phase1_core.sql?raw'
import hustleMigration from '../../supabase/migrations/002_hustle_mode.sql?raw'
import betaMigration from '../../supabase/migrations/003_beta.sql?raw'
import attendanceMigration from '../../supabase/migrations/004_attendance_grades.sql?raw'
import adaptiveMigration from '../../supabase/migrations/005_adaptive.sql?raw'
import reviewMigration from '../../supabase/migrations/006_weekly_review.sql?raw'
import lifeMigration from '../../supabase/migrations/007_life.sql?raw'
import socialMigration from '../../supabase/migrations/008_social.sql?raw'
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
const HUSTLE = id(22)
const PHASE = id(23)
const CLIENT = id(25)
const ITEM = id(26)

// The smallest rows each table accepts (in an order that respects the links), with ids given
// so both databases link the same rows. Columns not listed here get their default.
const ROWS: [DemoTable, Record<string, unknown>][] = [
  ['subjects', { id: SUBJECT, name: 'DBMS' }],
  ['subjects', { id: id(38), name: 'Maths', credits: 4, grade: 'A+' }],
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
  ['hustles', { id: HUSTLE, type: 'parttime', name: 'Maths tutoring', pipeline_stages: ['requested', 'scheduled', 'done', 'paid'] }],
  ['hustle_phases', { id: PHASE, hustle_id: HUSTLE, title: 'Find students' }],
  ['hustle_steps', { id: id(24), phase_id: PHASE, title: 'Learn to teach online', skill_name: 'Online teaching', skill_subject_id: SUBJECT, skill_topic_id: TOPIC }],
  ['clients', { id: CLIENT, hustle_id: HUSTLE, name: 'Riya (class 10)' }],
  ['clients', { id: id(29), hustle_id: HUSTLE, name: 'Arjun (class 12)' }],
  ['hustle_items', { id: ITEM, hustle_id: HUSTLE, kind: 'session', title: 'Algebra', stage: 'scheduled', order_index: 1.5, client_id: CLIENT, amount: 500 }],
  ['tasks', { id: TASK, title: 'DBMS assignment', subject_id: SUBJECT, hustle_id: HUSTLE }],
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
      hustle_id: HUSTLE,
    },
  ],
  ['daily_checkins', { id: id(19), date: '2026-11-02' }],
  ['focus_sessions', { id: FOCUS, area: 'academics', mode: 'custom', planned_minutes: 45, plan_block_id: BLOCK, subject_id: SUBJECT, hustle_id: HUSTLE }],
  ['distraction_events', { id: id(21), kind: 'mode_switch', focus_session_id: FOCUS, quiz_id: QUIZ, from_mode: 'study', to_mode: 'hustle', reason: 'urgent' }],
  ['transactions', { id: id(27), hustle_id: HUSTLE, client_id: CLIENT, hustle_item_id: ITEM, kind: 'income', amount: 500 }],
  ['time_entries', { id: id(28), hustle_id: HUSTLE, client_id: CLIENT, focus_session_id: FOCUS, started_at: '2026-11-02T04:00:00.000Z', minutes: 60 }],
  ['blocked_apps', { id: id(30), package_name: 'com.instagram.android' }],
  ['blocked_apps', { id: id(31), package_name: 'com.google.android.youtube', label: 'YouTube', active: false }],
  ['feedback', { id: id(32), kind: 'bug', message: 'The timer froze' }],
  ['feedback', { id: id(33), kind: 'idea', message: 'Dark mode', screen: 'Me', path: '/me', context: { app: 'web' } }],
  ['attendance', { id: id(34), subject_id: SUBJECT, date: '2026-11-02', status: 'present' }],
  ['attendance', { id: id(35), subject_id: SUBJECT, date: '2026-11-03', start_time: '09:00:00', status: 'absent' }],
  ['marks', { id: id(36), subject_id: SUBJECT, assessment: 'Internal 1', max_marks: 30, obtained: 24.5 }],
  ['semester_results', { id: id(37), semester: 1, sgpa: 8.4, credits: 22 }],
  ['subject_ratings', { id: id(39), subject_id: SUBJECT }],
  ['subject_ratings', { id: id(40), subject_id: id(38), rating: 1087.5, attempts_count: 12 }],
  ['metric_snapshots', { id: id(41), week_start: '2026-10-26' }],
  ['metric_snapshots', { id: id(42), week_start: '2026-11-02', memory: 0.85, learning_speed: 1.2, processing_speed: 42.5, problem_solving: 0.6, focus_minutes: 300, details: { reviews: 40 } }],
  ['challenges', { id: id(43), week_start: '2026-11-02', metric: 'memory', target: 0.88 }],
  ['weekly_reviews', { id: id(44), week_start: '2026-11-02' }],
  [
    'weekly_reviews',
    {
      id: id(45),
      week_start: '2026-10-26',
      stats: { blocks: { done: 12 } },
      insights: ['Mornings went best.'],
      changes: [{ type: 'set_buffer', percent: 15, reason: 'Many blocks were missed.', status: 'open' }],
      source: 'ai',
      model: 'smart-model',
      prompt_version: 'review-v1',
    },
  ],
  ['habits', { id: id(46), title: 'Read 20 minutes' }],
  ['habits', { id: id(47), title: 'Drink water', kind: 'water', days_of_week: [1, 2, 3], target: 8, unit: 'glasses', order_index: 2 }],
  ['habit_logs', { id: id(48), habit_id: id(46), date: '2026-11-02' }],
  ['habit_logs', { id: id(49), habit_id: id(47), date: '2026-11-02', value: 5, done: false }],
  ['workouts', { id: id(50), date: '2026-11-02', title: 'My own workout' }],
  [
    'workouts',
    { id: id(51), date: '2026-11-03', title: 'Gym A', program: 'gym', day_key: 'A', exercises: [{ name: 'Bench press', sets: [{ reps: 8, kg: 40 }] }], duration_min: 45, notes: 'Felt strong' },
  ],
  ['meals', { id: id(52), meal: 'lunch', description: 'Mess thali' }],
  ['meals', { id: id(53), meal: 'dinner', description: '2 roti and dal', calories: 420, protein_g: 16.5, carbs_g: 70, fat_g: 9, source: 'preset' }],
  ['sleep_logs', { id: id(54), date: '2026-11-02', bed_at: '2026-11-01T17:30:00.000Z', wake_at: '2026-11-02T01:00:00.000Z', minutes: 450 }],
  ['step_counts', { id: id(55), date: '2026-11-02', steps: 6500 }],
  ['step_counts', { id: id(56), date: '2026-11-02', steps: 7200, source: 'health_connect' }],
  ['speaking_sessions', { id: id(57), scenario: 'interview', prompt: 'Tell me about yourself.', duration_sec: 75 }],
  [
    'speaking_sessions',
    {
      id: id(58),
      scenario: 'small_talk',
      prompt: 'Any plans for the weekend?',
      duration_sec: 60,
      transcript: 'Um, so like, I want to go home.',
      words: 120,
      wpm: 120,
      filler_count: 3,
      fillers: { um: 1, like: 2 },
      scores: { clarity: 7 },
      feedback: ['Pause instead of saying um.'],
      source: 'ai',
    },
  ],
  // One row per student, so only one here: some numbers set, the rest as defaults.
  ['shared_stats', { id: id(59), display_name: 'Riya', week_start: '2026-11-02', focus_minutes: 45, studying_until: '2026-11-04T13:00:00.000Z' }],
]

/**
 * Columns that hold "now" (or "now + 1 day"), so their values differ by a few milliseconds, and
 * dates and times we set ourselves (Postgres gives them back as Date objects, the demo as text).
 */
const TIME_COLUMNS = new Set([
  'created_at',
  'updated_at',
  'started_at',
  'due_at',
  'reviewed_at',
  'next_review_at',
  'at',
  'date',
  'start_at',
  'end_at',
  'occurred_on',
  'week_start',
  'eaten_at',
  'bed_at',
  'wake_at',
  'studying_until',
])

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
  await db.exec(hustleMigration)
  await db.exec(betaMigration)
  await db.exec(attendanceMigration)
  await db.exec(adaptiveMigration)
  await db.exec(reviewMigration)
  await db.exec(lifeMigration)
  await db.exec(socialMigration)
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

describe('demoDb matches the real database (every migration)', () => {
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

  it('deletes and unlinks the same rows when a client and then a hustle are deleted', async () => {
    await asUser(async (tx) => {
      await tx.query('delete from public.clients where id = $1', [CLIENT])
      await tx.query('delete from public.hustles where id = $1', [HUSTLE])
    })
    demoDb.remove('clients', [CLIENT])
    demoDb.remove('hustles', [HUSTLE])

    for (const table of DEMO_TABLES) {
      const real = (await postgresRows(table)).map(comparable)
      const demo = demoRows(table).map(comparable)
      expect(demo, table).toEqual(real)
    }
    expect(demoDb.list('clients').map((client) => client.hustle_id)).toEqual([null]) // the other client stays, unlinked
    expect(demoDb.list('tasks')[0]?.hustle_id).toBeNull()
  })
})
