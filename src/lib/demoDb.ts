import { DEMO_USER } from '@/features/auth/demo'
import type { Database } from '@/types/database'

// Demo Mode's database: the same tables and rows as Supabase, kept in this browser's localStorage
// (one key per table). Nothing is sent to a server.
// It does the jobs Postgres does for us: ids, timestamps, column defaults (copied from
// supabase/migrations/001_phase1_core.sql and the later ones) and what happens to linked rows when a row is deleted
// (the foreign keys). demoDb.parity.test.ts checks all of this against the real migration.

type PublicTables = Database['public']['Tables']

/** The tables Demo Mode stores so far. */
export const DEMO_TABLES = [
  'subjects',
  'topics',
  'topic_prereqs',
  'materials',
  'material_pages',
  'ai_anchors',
  'lessons',
  'past_papers',
  'questions',
  'quizzes',
  'attempts',
  'flashcards',
  'flashcard_reviews',
  'code_snippets',
  'mistakes',
  'tasks',
  'plan_blocks',
  'daily_checkins',
  'focus_sessions',
  'distraction_events',
  'hustles',
  'hustle_phases',
  'hustle_steps',
  'clients',
  'hustle_items',
  'transactions',
  'time_entries',
  'blocked_apps',
  'feedback',
  'attendance',
  'marks',
  'semester_results',
  'subject_ratings',
  'metric_snapshots',
  'challenges',
] as const satisfies readonly (keyof PublicTables)[]

export type DemoTable = (typeof DEMO_TABLES)[number]
export type DemoRow<T extends DemoTable> = PublicTables[T]['Row']
export type DemoInsert<T extends DemoTable> = PublicTables[T]['Insert']
export type DemoUpdate<T extends DemoTable> = PublicTables[T]['Update']

const KEY_PREFIX = 'ekagra-demo-db:'
const DAY_MS = 24 * 60 * 60 * 1000

/** Column defaults from the migration (besides id, user_id and the timestamps). */
const DEFAULTS: { [T in DemoTable]: (now: Date) => Partial<DemoRow<T>> } = {
  subjects: () => ({
    kind: 'course',
    code: null,
    semester: null,
    exam_date: null,
    exam_date_estimated: false,
    weekly_minutes_limit: null,
    color: null,
    archived_at: null,
    credits: null,
    grade: null,
  }),
  topics: () => ({
    parent_id: null,
    order_index: 0,
    track: 'exam',
    source: 'syllabus',
    est_minutes: null,
    difficulty: null,
    exam_weight: 0,
    pyq_count: 0,
    pyq_marks_share: 0,
    last_asked_year: null,
    priority_score: 0,
    status: 'not_started',
    mastery: 0,
    target_date: null,
    learned_at: null,
  }),
  topic_prereqs: () => ({}),
  materials: () => ({
    subject_id: null,
    purpose: 'study',
    storage_path: null,
    source_url: null,
    page_count: null,
    duration_sec: null,
    status: 'uploaded',
    error: null,
  }),
  material_pages: () => ({ text: '', needs_ocr: false }),
  ai_anchors: () => ({
    selected_text: null,
    rect: null,
    question: null,
    response_md: null,
    topic_id: null,
    model: null,
    prompt_version: null,
  }),
  lessons: () => ({ sources: [], prompt_version: null, model: null }),
  past_papers: () => ({ material_id: null, year: null, exam_type: null }),
  questions: () => ({
    subject_id: null,
    topic_id: null,
    past_paper_id: null,
    options: null,
    answer: null,
    explanation: null,
    marks: null,
    difficulty: null,
    rating: null,
    tests: null,
    source_ref: null,
    year: null,
    prompt_version: null,
  }),
  quizzes: (now) => ({
    subject_id: null,
    topic_ids: [],
    time_limit_sec: null,
    started_at: now.toISOString(),
    finished_at: null,
    score: null,
  }),
  attempts: () => ({ quiz_id: null, answer: null, is_correct: null, score: null, time_ms: null, hints_used: 0 }),
  flashcards: (now) => ({
    topic_id: null,
    material_id: null,
    anchor_id: null,
    source: 'generated',
    fsrs: {},
    due_at: now.toISOString(),
    suspended: false,
  }),
  flashcard_reviews: (now) => ({ reviewed_at: now.toISOString(), duration_ms: null, log: null }),
  code_snippets: () => ({
    topic_id: null,
    question_id: null,
    title: 'Untitled',
    language: 'python',
    code: '',
    last_output: null,
    last_run_at: null,
    passed: null,
  }),
  mistakes: (now) => ({
    topic_id: null,
    question_id: null,
    flashcard_id: null,
    code_snippet_id: null,
    why_wrong: null,
    correct_approach: null,
    status: 'open',
    ladder_step: 0,
    correct_count: 0,
    last_correct_on: null,
    next_review_at: new Date(now.getTime() + DAY_MS).toISOString(),
  }),
  tasks: () => ({
    area: 'personal',
    subject_id: null,
    hustle_id: null,
    notes: null,
    due_at: null,
    est_minutes: null,
    priority: 2,
    status: 'todo',
    source: 'manual',
    source_ref: null,
    completed_at: null,
  }),
  plan_blocks: () => ({
    subject_id: null,
    topic_id: null,
    task_id: null,
    hustle_id: null,
    actual_minutes: null,
    status: 'planned',
    at_risk: false,
    plan_version: 1,
  }),
  daily_checkins: () => ({
    minimum_day: false,
    crashed_at: null,
    energy: null,
    mood: null,
    top_distraction: null,
    note: null,
    checked_in_at: null,
  }),
  focus_sessions: (now) => ({
    plan_block_id: null,
    subject_id: null,
    hustle_id: null,
    started_at: now.toISOString(),
    ended_at: null,
    actual_minutes: null,
    outcome: null,
    completed: false,
  }),
  distraction_events: (now) => ({
    focus_session_id: null,
    at: now.toISOString(),
    app_package: null,
    reason: null,
    from_mode: null,
    to_mode: null,
    quiz_id: null,
    unlock_until: null,
  }),
  hustles: () => ({
    goal: null,
    goal_amount: null,
    goal_date: null,
    currency: 'INR',
    pipeline_stages: [],
    status: 'active',
    links: [],
  }),
  hustle_phases: () => ({
    order_index: 0,
    status: 'todo',
    started_at: null,
    completed_at: null,
  }),
  hustle_steps: () => ({
    order_index: 0,
    done: false,
    skill_name: null,
    skill_subject_id: null,
    skill_topic_id: null,
  }),
  clients: () => ({
    hustle_id: null,
    platform: null,
    contact: null,
    notes: null,
  }),
  hustle_items: () => ({
    kind: 'other',
    order_index: 0,
    client_id: null,
    amount: null,
    currency: null,
    due_at: null,
    url: null,
    data: {},
  }),
  transactions: (now) => ({
    client_id: null,
    hustle_item_id: null,
    currency: 'INR',
    occurred_on: now.toISOString().slice(0, 10),
    category: null,
    note: null,
    source: 'manual',
    source_ref: null,
  }),
  time_entries: () => ({
    client_id: null,
    focus_session_id: null,
    ended_at: null,
    source: 'manual',
    note: null,
  }),
  blocked_apps: () => ({
    label: null,
    active: true,
  }),
  feedback: () => ({
    screen: null,
    path: null,
    screenshot_path: null,
    context: {},
    status: 'new',
  }),
  attendance: () => ({ start_time: null }),
  marks: () => ({ date: null }),
  semester_results: () => ({}),
  subject_ratings: () => ({ rating: 1000, attempts_count: 0 }),
  metric_snapshots: () => ({
    memory: null,
    learning_speed: null,
    processing_speed: null,
    problem_solving: null,
    focus_minutes: 0,
    details: {},
  }),
  challenges: () => ({ baseline: null, achieved: null }),
}

interface ForeignKey {
  table: DemoTable
  column: string
  references: DemoTable
  /** cascade = delete the linked rows too; set null = keep them but clear the link. */
  onDelete: 'cascade' | 'set null'
}

/** What happens to linked rows when a row is deleted (the foreign keys of the migration). */
const FOREIGN_KEYS: ForeignKey[] = [
  { table: 'topics', column: 'subject_id', references: 'subjects', onDelete: 'cascade' },
  { table: 'topics', column: 'parent_id', references: 'topics', onDelete: 'cascade' },
  { table: 'topic_prereqs', column: 'topic_id', references: 'topics', onDelete: 'cascade' },
  { table: 'topic_prereqs', column: 'prereq_topic_id', references: 'topics', onDelete: 'cascade' },
  { table: 'materials', column: 'subject_id', references: 'subjects', onDelete: 'set null' },
  { table: 'material_pages', column: 'material_id', references: 'materials', onDelete: 'cascade' },
  { table: 'ai_anchors', column: 'material_id', references: 'materials', onDelete: 'cascade' },
  { table: 'ai_anchors', column: 'topic_id', references: 'topics', onDelete: 'set null' },
  { table: 'lessons', column: 'topic_id', references: 'topics', onDelete: 'cascade' },
  { table: 'past_papers', column: 'subject_id', references: 'subjects', onDelete: 'cascade' },
  { table: 'past_papers', column: 'material_id', references: 'materials', onDelete: 'set null' },
  { table: 'questions', column: 'subject_id', references: 'subjects', onDelete: 'cascade' },
  { table: 'questions', column: 'topic_id', references: 'topics', onDelete: 'cascade' },
  { table: 'questions', column: 'past_paper_id', references: 'past_papers', onDelete: 'set null' },
  { table: 'quizzes', column: 'subject_id', references: 'subjects', onDelete: 'set null' },
  { table: 'attempts', column: 'question_id', references: 'questions', onDelete: 'cascade' },
  { table: 'attempts', column: 'quiz_id', references: 'quizzes', onDelete: 'cascade' },
  { table: 'flashcards', column: 'topic_id', references: 'topics', onDelete: 'cascade' },
  { table: 'flashcards', column: 'material_id', references: 'materials', onDelete: 'set null' },
  { table: 'flashcards', column: 'anchor_id', references: 'ai_anchors', onDelete: 'set null' },
  { table: 'flashcard_reviews', column: 'flashcard_id', references: 'flashcards', onDelete: 'cascade' },
  { table: 'code_snippets', column: 'topic_id', references: 'topics', onDelete: 'set null' },
  { table: 'code_snippets', column: 'question_id', references: 'questions', onDelete: 'set null' },
  { table: 'mistakes', column: 'topic_id', references: 'topics', onDelete: 'set null' },
  { table: 'mistakes', column: 'question_id', references: 'questions', onDelete: 'set null' },
  { table: 'mistakes', column: 'flashcard_id', references: 'flashcards', onDelete: 'set null' },
  { table: 'mistakes', column: 'code_snippet_id', references: 'code_snippets', onDelete: 'set null' },
  { table: 'tasks', column: 'subject_id', references: 'subjects', onDelete: 'set null' },
  { table: 'plan_blocks', column: 'subject_id', references: 'subjects', onDelete: 'set null' },
  { table: 'plan_blocks', column: 'topic_id', references: 'topics', onDelete: 'set null' },
  { table: 'plan_blocks', column: 'task_id', references: 'tasks', onDelete: 'set null' },
  { table: 'focus_sessions', column: 'plan_block_id', references: 'plan_blocks', onDelete: 'set null' },
  { table: 'focus_sessions', column: 'subject_id', references: 'subjects', onDelete: 'set null' },
  { table: 'distraction_events', column: 'focus_session_id', references: 'focus_sessions', onDelete: 'set null' },
  { table: 'distraction_events', column: 'quiz_id', references: 'quizzes', onDelete: 'set null' },
  { table: 'hustle_phases', column: 'hustle_id', references: 'hustles', onDelete: 'cascade' },
  { table: 'hustle_steps', column: 'phase_id', references: 'hustle_phases', onDelete: 'cascade' },
  { table: 'hustle_steps', column: 'skill_subject_id', references: 'subjects', onDelete: 'set null' },
  { table: 'hustle_steps', column: 'skill_topic_id', references: 'topics', onDelete: 'set null' },
  { table: 'clients', column: 'hustle_id', references: 'hustles', onDelete: 'set null' },
  { table: 'hustle_items', column: 'hustle_id', references: 'hustles', onDelete: 'cascade' },
  { table: 'hustle_items', column: 'client_id', references: 'clients', onDelete: 'set null' },
  { table: 'transactions', column: 'hustle_id', references: 'hustles', onDelete: 'cascade' },
  { table: 'transactions', column: 'client_id', references: 'clients', onDelete: 'set null' },
  { table: 'transactions', column: 'hustle_item_id', references: 'hustle_items', onDelete: 'set null' },
  { table: 'time_entries', column: 'hustle_id', references: 'hustles', onDelete: 'cascade' },
  { table: 'time_entries', column: 'client_id', references: 'clients', onDelete: 'set null' },
  { table: 'time_entries', column: 'focus_session_id', references: 'focus_sessions', onDelete: 'set null' },
  { table: 'tasks', column: 'hustle_id', references: 'hustles', onDelete: 'set null' },
  { table: 'plan_blocks', column: 'hustle_id', references: 'hustles', onDelete: 'set null' },
  { table: 'focus_sessions', column: 'hustle_id', references: 'hustles', onDelete: 'set null' },
  { table: 'attendance', column: 'subject_id', references: 'subjects', onDelete: 'cascade' },
  { table: 'marks', column: 'subject_id', references: 'subjects', onDelete: 'cascade' },
  { table: 'subject_ratings', column: 'subject_id', references: 'subjects', onDelete: 'cascade' },
]

/** Inside this file rows are plain objects; the public functions below give them their table's type. */
type AnyRow = Record<string, unknown> & { id: string }

function read(table: DemoTable): AnyRow[] {
  try {
    const saved = localStorage.getItem(KEY_PREFIX + table)
    const rows: unknown = saved ? JSON.parse(saved) : []
    return Array.isArray(rows) ? (rows as AnyRow[]) : []
  } catch {
    return []
  }
}

function write(table: DemoTable, rows: AnyRow[]): void {
  try {
    localStorage.setItem(KEY_PREFIX + table, JSON.stringify(rows))
  } catch {
    throw new Error('Demo Mode storage on this device is full. Delete some demo data, or sign in to save it online.')
  }
}

function newRow(table: DemoTable, values: Record<string, unknown>, now: Date): AnyRow {
  const timestamp = now.toISOString()
  const id = typeof values.id === 'string' ? values.id : crypto.randomUUID()
  return { ...DEFAULTS[table](now), created_at: timestamp, updated_at: timestamp, ...values, id, user_id: DEMO_USER.id }
}

function removeRows(table: DemoTable, ids: Set<string>): void {
  if (ids.size === 0) return
  write(table, read(table).filter((row) => !ids.has(row.id)))
  for (const key of FOREIGN_KEYS.filter((foreignKey) => foreignKey.references === table)) {
    const linked = read(key.table)
    const isLinked = (row: AnyRow) => {
      const value = row[key.column]
      return typeof value === 'string' && ids.has(value)
    }
    if (key.onDelete === 'cascade') {
      removeRows(key.table, new Set(linked.filter(isLinked).map((row) => row.id)))
    } else {
      write(key.table, linked.map((row) => (isLinked(row) ? { ...row, [key.column]: null } : row)))
    }
  }
}

export const demoDb = {
  list<T extends DemoTable>(table: T): DemoRow<T>[] {
    return read(table) as unknown as DemoRow<T>[]
  },

  get<T extends DemoTable>(table: T, id: string): DemoRow<T> | null {
    return (read(table).find((row) => row.id === id) as unknown as DemoRow<T> | undefined) ?? null
  },

  /** Adds rows. Like Postgres, it fills in the id, user_id, timestamps and column defaults. */
  insert<T extends DemoTable>(table: T, values: DemoInsert<T>[]): DemoRow<T>[] {
    const now = new Date()
    const added = values.map((value) => newRow(table, value, now))
    write(table, [...read(table), ...added])
    return added as unknown as DemoRow<T>[]
  },

  /** Changes one row. The id and owner never change; updated_at is set to now. */
  update<T extends DemoTable>(table: T, id: string, patch: DemoUpdate<T>): DemoRow<T> {
    const rows = read(table)
    const index = rows.findIndex((row) => row.id === id)
    const current = rows[index]
    if (!current) throw new Error(`Demo Mode: no ${table} row with id ${id}`)
    const updated: AnyRow = { ...current, ...patch, id: current.id, user_id: current.user_id, updated_at: new Date().toISOString() }
    rows[index] = updated
    write(table, rows)
    return updated as unknown as DemoRow<T>
  },

  /** Deletes rows, and deletes or unlinks the rows that point at them (like the foreign keys). */
  remove(table: DemoTable, ids: string[]): void {
    removeRows(table, new Set(ids))
  },

  /** Deletes every Demo Mode table on this device. */
  clear(): void {
    for (const table of DEMO_TABLES) {
      try {
        localStorage.removeItem(KEY_PREFIX + table)
      } catch {
        // Storage is blocked: nothing is saved to clear.
      }
    }
  },
}
