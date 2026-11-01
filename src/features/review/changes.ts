import { z } from 'zod'
import { minutesLabel } from '@/features/academics/labels'
import { METRIC_LABEL, METRICS, type Metric, type MetricValues } from '@/features/metrics/metrics'
import { DAY_WINDOWS, WINDOW_HOURS, type DayWindow } from '@/features/planner/planner'
import { formatTime } from '@/features/planner/time'
import type { Area } from '@/features/planner/types'
import type { Settings, SettingsPatch } from '@/features/profile/settings'
import { WINDOW_LABEL } from './weekStats'

// The changes a weekly review can suggest: a fixed list, each one something the app can do in one
// tap. Most are planner settings (the plan is then made again by itself); one picks next week's
// challenge and one a skill course's weekly time. The AI may only pick from this list, and every
// change is checked here before it's shown. Pure functions, tested on their own.

export const CHANGE_TYPES = [
  'move_subject_to_window',
  'shift_budget',
  'set_buffer',
  'set_review_cap',
  'set_new_cards',
  'set_block_length',
  'set_peak_window',
  'set_revision_days',
  'block_apps_in_study',
  'challenge_metric',
  'set_skill_minutes',
] as const
export type ChangeType = (typeof CHANGE_TYPES)[number]

const AREAS = ['academics', 'hustle', 'life'] as const
const AREA_LABEL: Record<Area, string> = { academics: 'Academics', hustle: 'Hustle', life: 'Life' }

/** Changes that set one number. */
export const NUMBER_RULES = {
  set_buffer: { min: 5, max: 30, step: 1 },
  set_review_cap: { min: 10, max: 90, step: 5 },
  set_new_cards: { min: 0, max: 50, step: 1 },
  set_block_length: { min: 25, max: 60, step: 5 },
  set_revision_days: { min: 3, max: 30, step: 1 },
  set_skill_minutes: { min: 30, max: 600, step: 15 },
} as const
export type NumberType = keyof typeof NUMBER_RULES

/** Budget moves go in steps of 5 points, at most 20. */
export const SHIFT_RULE = { min: 5, max: 20, step: 5 } as const

/** A type (not an interface) so it can be saved as JSON in weekly_reviews.changes. */
export type Change =
  | { type: 'move_subject_to_window'; subjectId: string; window: DayWindow }
  | { type: 'shift_budget'; from: Area; to: Area; points: number }
  | { type: 'set_buffer' | 'set_review_cap' | 'set_new_cards' | 'set_block_length' | 'set_revision_days'; value: number }
  | { type: 'set_peak_window'; window: DayWindow }
  | { type: 'block_apps_in_study' }
  | { type: 'challenge_metric'; metric: Metric }
  | { type: 'set_skill_minutes'; subjectId: string; value: number }

export type ChangeStatus = 'open' | 'applied' | 'skipped'

/** A change as a review keeps it: why it's suggested, and what the student did with it. */
export type ReviewChange = Change & { reason: string; status: ChangeStatus }

/** Within the limits, on the step: 17.4 → 17, 3 → 5 (block length). */
export function fitNumber(rule: { min: number; max: number; step: number }, value: number): number {
  const stepped = Math.round(value / rule.step) * rule.step
  return Math.min(rule.max, Math.max(rule.min, stepped))
}

const base = { reason: z.string().max(400).catch(''), status: z.enum(['open', 'applied', 'skipped']).catch('open') }
const number = z.number().finite()
const reviewChangeSchema: z.ZodType<ReviewChange> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move_subject_to_window'), subjectId: z.string().min(1), window: z.enum(DAY_WINDOWS), ...base }),
  z.object({ type: z.literal('shift_budget'), from: z.enum(AREAS), to: z.enum(AREAS), points: number, ...base }),
  z.object({ type: z.enum(['set_buffer', 'set_review_cap', 'set_new_cards', 'set_block_length', 'set_revision_days']), value: number, ...base }),
  z.object({ type: z.literal('set_peak_window'), window: z.enum(DAY_WINDOWS), ...base }),
  z.object({ type: z.literal('block_apps_in_study'), ...base }),
  z.object({ type: z.literal('challenge_metric'), metric: z.enum(METRICS), ...base }),
  z.object({ type: z.literal('set_skill_minutes'), subjectId: z.string().min(1), value: number, ...base }),
])

/** A review's saved changes; anything broken (or from an older version of the app) is left out. */
export function readReviewChanges(json: unknown): ReviewChange[] {
  if (!Array.isArray(json)) return []
  return json.flatMap((item) => {
    const parsed = reviewChangeSchema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}

export interface ChangeContext {
  settings: Settings
  subjects: ReadonlyMap<string, { name: string; kind: string; weeklyMinutes: number | null }>
  /** The reviewed week's metrics: next week's challenge needs a value to aim from. */
  metrics: MetricValues | null
  /** The best focus hours used now ('HH:MM'). */
  peak: { start: string; end: string }
  /** A skill course's weekly minutes when it has none set. */
  defaultSkillMinutes: number
}

/** A part of the day as best focus hours ('HH:MM'; night ends at 23:59). */
export function peakFor(window: DayWindow): { start: string; end: string } {
  const [start, end] = WINDOW_HOURS[window]
  return { start: formatTime(start * 60), end: formatTime(Math.min(end * 60, 23 * 60 + 59)) }
}

function currentNumber(change: Extract<Change, { value: number }>, ctx: ChangeContext): number | null {
  const { planner, learning } = ctx.settings
  switch (change.type) {
    case 'set_buffer':
      return planner.bufferPct
    case 'set_review_cap':
      return planner.maxReviewMinutes
    case 'set_new_cards':
      return learning.newCardsPerDay
    case 'set_block_length':
      return planner.maxBlockMinutes
    case 'set_revision_days':
      return planner.revisionDays
    case 'set_skill_minutes': {
      const subject = ctx.subjects.get(change.subjectId)
      return subject ? (subject.weeklyMinutes ?? ctx.defaultSkillMinutes) : null
    }
  }
}

/** Why a change can't be applied (or changes nothing), in plain words; null when it's fine. */
export function changeProblem(change: Change, ctx: ChangeContext): string | null {
  switch (change.type) {
    case 'move_subject_to_window': {
      const subject = ctx.subjects.get(change.subjectId)
      if (!subject || subject.kind !== 'course') return 'That subject is no longer here.'
      return ctx.settings.planner.subjectWindows[change.subjectId] === change.window ? `${subject.name} is already in the ${WINDOW_LABEL[change.window]}.` : null
    }
    case 'shift_budget': {
      if (change.from === change.to) return 'Pick two different areas.'
      const has = ctx.settings.budget[change.from]
      return has < change.points ? `${AREA_LABEL[change.from]} has only ${has}% to give.` : null
    }
    case 'set_peak_window': {
      const wanted = peakFor(change.window)
      return wanted.start === ctx.peak.start && wanted.end === ctx.peak.end ? 'Those are already your best focus hours.' : null
    }
    case 'block_apps_in_study':
      return ctx.settings.focus.blockDuring === 'study_blocks' ? 'Apps are already blocked in every study block.' : null
    case 'challenge_metric':
      return ctx.metrics?.[change.metric] == null ? `There wasn't enough practice this week to set a ${METRIC_LABEL[change.metric].toLowerCase()} target.` : null
    case 'set_skill_minutes': {
      const subject = ctx.subjects.get(change.subjectId)
      if (!subject || subject.kind !== 'skill_course') return 'That skill course is no longer here.'
      return currentNumber(change, ctx) === change.value ? 'That is already its weekly time.' : null
    }
    default:
      return currentNumber(change, ctx) === change.value ? 'That is already the setting.' : null
  }
}

/** The change in words: a short title and what it means, with the setting it replaces. */
export function describeChange(change: Change, ctx: ChangeContext): { title: string; detail: string } {
  const { planner, learning } = ctx.settings
  switch (change.type) {
    case 'move_subject_to_window': {
      const name = ctx.subjects.get(change.subjectId)?.name ?? 'This subject'
      const [start, end] = WINDOW_HOURS[change.window]
      return { title: `Study ${name} in the ${WINDOW_LABEL[change.window]}`, detail: `Its study blocks go between ${formatTime(start * 60)} and ${formatTime(Math.min(end * 60, 1439))} first.` }
    }
    case 'shift_budget': {
      const budget = ctx.settings.budget
      return {
        title: `Give ${AREA_LABEL[change.to]} ${change.points}% more time, from ${AREA_LABEL[change.from]}`,
        detail: `${AREA_LABEL[change.to]} ${budget[change.to]}% → ${budget[change.to] + change.points}%, ${AREA_LABEL[change.from]} ${budget[change.from]}% → ${budget[change.from] - change.points}%.`,
      }
    }
    case 'set_buffer':
      return { title: `Keep ${change.value}% of free time unplanned`, detail: `Now ${planner.bufferPct}%. Room for surprises means fewer missed blocks.` }
    case 'set_review_cap':
      return { title: `Allow up to ${change.value} minutes of reviews a day`, detail: `Now ${planner.maxReviewMinutes} minutes.` }
    case 'set_new_cards':
      return { title: `Learn ${change.value} new flashcards a day`, detail: `Now ${learning.newCardsPerDay}. Fewer new cards means fewer reviews piling up.` }
    case 'set_block_length':
      return { title: `Study in blocks of up to ${change.value} minutes`, detail: `Now ${planner.maxBlockMinutes} minutes.` }
    case 'set_peak_window': {
      const wanted = peakFor(change.window)
      return { title: `Make the ${WINDOW_LABEL[change.window]} your best focus hours`, detail: `Hard topics go ${wanted.start}–${wanted.end} first. Now ${ctx.peak.start}–${ctx.peak.end}.` }
    }
    case 'set_revision_days':
      return { title: `Finish topics ${change.value} days before each exam`, detail: `Now ${planner.revisionDays} days. The rest is time to revise.` }
    case 'block_apps_in_study':
      return { title: 'Block distracting apps in every study block', detail: 'Now only during focus sessions (in the Android app).' }
    case 'challenge_metric':
      return { title: `Next week's challenge: ${METRIC_LABEL[change.metric].toLowerCase()}`, detail: "Its target starts 5% better than this week's value." }
    case 'set_skill_minutes': {
      const name = ctx.subjects.get(change.subjectId)?.name ?? 'This skill course'
      const now = currentNumber(change, ctx)
      return { title: `Give ${name} ${minutesLabel(change.value)} a week`, detail: now === null ? '' : `Now ${minutesLabel(now)}.` }
    }
  }
}

/** The settings a change saves; null when it's not a setting (next week's challenge, a skill course's time). */
export function settingsPatch(change: Change, settings: Settings): SettingsPatch | null {
  switch (change.type) {
    case 'move_subject_to_window':
      return { planner: { subjectWindows: { ...settings.planner.subjectWindows, [change.subjectId]: change.window } } }
    case 'shift_budget': {
      const budget = { ...settings.budget }
      budget[change.from] -= change.points
      budget[change.to] += change.points
      return { budget }
    }
    case 'set_buffer':
      return { planner: { bufferPct: change.value } }
    case 'set_review_cap':
      return { planner: { maxReviewMinutes: change.value } }
    case 'set_new_cards':
      return { learning: { newCardsPerDay: change.value } }
    case 'set_block_length':
      return { planner: { maxBlockMinutes: change.value } }
    case 'set_peak_window': {
      const { start, end } = peakFor(change.window)
      return { planner: { peakStart: start, peakEnd: end } }
    }
    case 'set_revision_days':
      return { planner: { revisionDays: change.value } }
    case 'block_apps_in_study':
      return { focus: { blockDuring: 'study_blocks' } }
    case 'challenge_metric':
    case 'set_skill_minutes':
      return null
  }
}

/** A change edited by the student: a new number (kept within its limits), part of the day or metric. */
export function editChange(change: Change, edit: { value?: number; window?: DayWindow; metric?: Metric }): Change {
  if ('value' in change && edit.value !== undefined) return { ...change, value: fitNumber(NUMBER_RULES[change.type], edit.value) }
  if (change.type === 'shift_budget' && edit.value !== undefined) return { ...change, points: fitNumber(SHIFT_RULE, edit.value) }
  if ('window' in change && edit.window) return { ...change, window: edit.window }
  if (change.type === 'challenge_metric' && edit.metric) return { ...change, metric: edit.metric }
  return change
}

/** A change suggested in the AI's flat format; subjects come as short keys (s1, s2, …). */
export interface FlatChange {
  type: string
  subjectKey: string | null
  window: string | null
  from: string | null
  to: string | null
  value: number | null
  metric: string | null
}

const isWindow = (value: string | null): value is DayWindow => value !== null && (DAY_WINDOWS as readonly string[]).includes(value)
const isArea = (value: string | null): value is Area => value !== null && (AREAS as readonly string[]).includes(value)
const isMetric = (value: string | null): value is Metric => value !== null && (METRICS as readonly string[]).includes(value)

/** The AI's flat change as a Change (numbers fitted to their limits), or null when something is missing. */
export function fromFlatChange(flat: FlatChange, subjectIdByKey: ReadonlyMap<string, string>): Change | null {
  const subjectId = flat.subjectKey ? (subjectIdByKey.get(flat.subjectKey) ?? null) : null
  switch (flat.type) {
    case 'move_subject_to_window':
      return subjectId && isWindow(flat.window) ? { type: flat.type, subjectId, window: flat.window } : null
    case 'shift_budget':
      return isArea(flat.from) && isArea(flat.to) && flat.from !== flat.to ? { type: flat.type, from: flat.from, to: flat.to, points: fitNumber(SHIFT_RULE, flat.value ?? 5) } : null
    case 'set_buffer':
    case 'set_review_cap':
    case 'set_new_cards':
    case 'set_block_length':
    case 'set_revision_days':
      return flat.value === null ? null : { type: flat.type, value: fitNumber(NUMBER_RULES[flat.type], flat.value) }
    case 'set_peak_window':
      return isWindow(flat.window) ? { type: flat.type, window: flat.window } : null
    case 'block_apps_in_study':
      return { type: flat.type }
    case 'challenge_metric':
      return isMetric(flat.metric) ? { type: flat.type, metric: flat.metric } : null
    case 'set_skill_minutes':
      return subjectId && flat.value !== null ? { type: flat.type, subjectId, value: fitNumber(NUMBER_RULES.set_skill_minutes, flat.value) } : null
    default:
      return null
  }
}

/** Two changes that set the same thing can't both be suggested (the first one stays). */
export function changeKey(change: Change): string {
  if ('subjectId' in change) return `${change.type}:${change.subjectId}`
  return change.type
}
