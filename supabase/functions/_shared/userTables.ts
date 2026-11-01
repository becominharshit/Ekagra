// Every table that holds a student's rows (besides profiles), shared by account-delete (wiping data),
// the app's "Export all data" and tests/db (which checks the list is complete and the order works).
// This file has no imports: it is bundled for Deno and for the app.

/**
 * Children before parents (a row is deleted before the rows it points at), so deleting the tables
 * in this order never trips over a link. Each one has a user_id column.
 */
export const USER_TABLES = [
  'distraction_events',
  'time_entries',
  'transactions',
  'attempts',
  'flashcard_reviews',
  'mistakes',
  'code_snippets',
  'flashcards',
  'ai_anchors',
  'material_pages',
  'material_sections',
  'lessons',
  'topic_prereqs',
  'questions',
  'past_papers',
  'quizzes',
  'focus_sessions',
  'plan_blocks',
  'tasks',
  'hustle_steps',
  'hustle_phases',
  'hustle_items',
  'clients',
  'hustles',
  'materials',
  'attendance',
  'marks',
  'subject_ratings',
  'routine_blocks',
  'topics',
  'subjects',
  'semester_results',
  'metric_snapshots',
  'challenges',
  'weekly_reviews',
  'daily_checkins',
  'blocked_apps',
  'feedback',
  'jobs',
  'ai_usage',
] as const

export type UserTable = (typeof USER_TABLES)[number]

/**
 * "Wipe my data" keeps these: AI usage counts the daily AI limit and the app's budget, so wiping
 * can't reset them. Deleting the account removes them too.
 */
export const KEPT_BY_WIPE: readonly UserTable[] = ['ai_usage']

/** "Wipe my data" puts the profile back to how sign-up left it (name and photo stay), so setup starts again. */
export const PROFILE_RESET = {
  college: null,
  program: null,
  year: null,
  semester: null,
  chronotype: 'neutral',
  mentor_tone: 'balanced',
  currency: 'INR',
  settings: {},
  onboarded_at: null,
} as const
