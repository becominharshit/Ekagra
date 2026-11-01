import { readSettings } from '@/features/profile/settings'
import type { ReviewContext } from './review'
import type { WeekStats } from './weekStats'

// Shared test data for the weekly review: a quiet week and the context around it.

const none = { attempts: 0, accuracy: null }

export function quietWeek(values: Partial<WeekStats> = {}): WeekStats {
  return {
    weekStart: '2026-11-02',
    weekEnd: '2026-11-08',
    areas: {
      academics: { planned: 0, done: 0, budgetPct: 55, sharePct: 0 },
      hustle: { planned: 0, done: 0, budgetPct: 25, sharePct: 0 },
      life: { planned: 0, done: 0, budgetPct: 20, sharePct: 0 },
    },
    blocks: { planned: 0, done: 0, partial: 0, missed: 0, open: 0 },
    subjects: [],
    topicsLearned: [],
    quiz: none,
    accuracyByWindow: { morning: none, afternoon: none, evening: none, night: none },
    reviews: { count: 0, retention: null },
    focus: { minutes: 0, sessions: 0, completed: 0 },
    distractions: { total: 0, unlocks: 0, topApps: [], topHours: [], reasons: [] },
    checkIns: { days: 0, energy: null, mood: null, crashedDays: 0 },
    tasks: { completed: 0, overdue: 0 },
    hustle: { minutes: 0, income: [] },
    metrics: null,
    ...values,
  }
}

export function reviewContext(values: Partial<ReviewContext> = {}): ReviewContext {
  return {
    settings: readSettings({}),
    subjects: new Map([
      ['dbms', { name: 'DBMS', kind: 'course', weeklyMinutes: null, examDate: '2026-11-28' }],
      ['logo', { name: 'Logo design', kind: 'skill_course', weeklyMinutes: null, examDate: null }],
    ]),
    metrics: null,
    peak: { start: '09:00', end: '13:00' },
    defaultSkillMinutes: 120,
    mentorTone: 'balanced',
    today: '2026-11-08',
    challenge: null,
    ...values,
  }
}
