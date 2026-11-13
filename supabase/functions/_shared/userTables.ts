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
  'notes',
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
  'habit_logs',
  'habits',
  'workouts',
  'meals',
  'sleep_logs',
  'step_counts',
  'speaking_sessions',
  'nudges',
  'blocked_users',
  'abuse_reports',
  'group_sessions',
  'group_members',
  'study_groups',
  'partner_links',
  'partner_invites',
  'shared_stats',
  'daily_checkins',
  'blocked_apps',
  'feedback',
  'analytics_events',
  'jobs',
  'ai_usage',
  'subscriptions',
] as const

export type UserTable = (typeof USER_TABLES)[number]

/** Global/system tables that do not hold per-user rows (kept outside USER_TABLES). */
export const GLOBAL_SYSTEM_TABLES = ['plan_entitlements', 'webhook_events', 'youtube_note_cache'] as const

/**
 * "Wipe my data" keeps these: AI usage counts the daily AI limit, and subscriptions keep active
 * billing tiers intact. Deleting the account removes subscriptions via cascade while keeping
 * webhook_events for billing auditability.
 */
export const KEPT_BY_WIPE: readonly UserTable[] = ['ai_usage', 'subscriptions']

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
