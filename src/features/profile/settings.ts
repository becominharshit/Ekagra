import { z } from 'zod'
import { PEAK_WINDOWS, STANDARD_BUDGET } from '@/features/planner/planner'
import { formatTime, parseTime } from '@/features/planner/time'
import type { Area, Budget, Chronotype, PlannerSettings } from '@/features/planner/types'
import type { Json } from '@/types/database'

// What a student can customize, saved in profiles.settings (a JSON column).
// Zod checks the saved JSON: anything missing or broken falls back to its default,
// and settings this file doesn't know about yet are kept as they are.

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM, for example 09:00')

export const budgetSchema = z
  .object({
    academics: z.number().int().min(0).max(100),
    hustle: z.number().int().min(0).max(100),
    life: z.number().int().min(0).max(100),
  })
  .refine((budget) => budget.academics + budget.hustle + budget.life === 100, {
    message: 'Academics, Hustle and Life must add up to 100%',
  })

const plannerSchema = z.looseObject({
  bufferPct: z.number().min(0).max(50).catch(12),
  revisionDays: z.number().int().min(0).max(60).catch(10),
  maxReviewMinutes: z.number().int().min(0).max(120).catch(30),
  maxDailyIncreasePct: z.number().min(0).max(100).catch(20),
  /** Best focus hours. Empty means "use the default for my rhythm". */
  peakStart: timeOfDay.optional().catch(undefined),
  peakEnd: timeOfDay.optional().catch(undefined),
})

const learningSchema = z.looseObject({
  newCardsPerDay: z.number().int().min(0).max(200).catch(20),
  /** How many flashcards you should still remember when they come back (FSRS), 80–95%. */
  targetRetention: z.number().min(0.8).max(0.95).catch(0.9),
})

/** Minutes of focus, then of break (Pomodoro and Deep work). */
const lengths = (work: number, rest: number) =>
  z.object({ work: z.number().int().min(5).max(180), break: z.number().int().min(1).max(60) }).catch({ work, break: rest })

// The keys and defaults match the profiles.settings default in the 001 migration.
const focusSchema = z.looseObject({
  pomodoro: lengths(25, 5),
  deep: lengths(50, 10),
  /** FocusGuard blocks apps during focus sessions only, or during every Study block. */
  blockDuring: z.enum(['focus_sessions', 'study_blocks']).catch('focus_sessions'),
  /** The timer that "Start focus" uses. */
  defaultMode: z.enum(['pomodoro', 'deep', 'custom']).catch('pomodoro'),
  /** Study sessions pause after 4 minutes without a tap, scroll or key press. */
  idleCheck: z.boolean().catch(true),
})

const tollboothSchema = z.looseObject({
  /** Rapid-fire questions to get all right for an emergency unlock. */
  questions: z.number().int().min(1).max(10).catch(3),
  /** How long blocked apps stay open after passing. */
  unlockMinutes: z.number().int().min(3).max(5).catch(3),
  /** Emergency unlocks a day. */
  dailyLimit: z.number().int().min(0).max(10).catch(3),
})

export const settingsSchema = z.looseObject({
  budget: budgetSchema.catch(() => ({ ...STANDARD_BUDGET })),
  planner: plannerSchema.catch(() => plannerSchema.parse({})),
  learning: learningSchema.catch(() => learningSchema.parse({})),
  focus: focusSchema.catch(() => focusSchema.parse({})),
  tollbooth: tollboothSchema.catch(() => tollboothSchema.parse({})),
})

export type Settings = z.infer<typeof settingsSchema>

export type MentorTone = 'strict' | 'balanced' | 'friendly'

export const CHRONOTYPE_LABEL: Record<Chronotype, string> = {
  early: 'Early bird',
  neutral: 'In between',
  night: 'Night owl',
}

export const MENTOR_TONE_LABEL: Record<MentorTone, string> = {
  strict: 'Strict',
  balanced: 'Balanced',
  friendly: 'Friendly',
}

/** profiles.chronotype → a rhythm the planner knows ('neutral' for anything else). */
export function toChronotype(value: string | null | undefined): Chronotype {
  return value === 'early' || value === 'night' ? value : 'neutral'
}

/** profiles.mentor_tone → a known mentor style ('balanced' for anything else). */
export function toMentorTone(value: string | null | undefined): MentorTone {
  return value === 'strict' || value === 'friendly' ? value : 'balanced'
}

/** The timezone this device is set to, e.g. 'Asia/Kolkata'. */
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'
  } catch {
    return 'Asia/Kolkata'
  }
}

/** Reads saved settings. Missing or broken values get their defaults. */
export function readSettings(raw: unknown): Settings {
  const parsed = settingsSchema.safeParse(raw ?? {})
  return parsed.success ? parsed.data : settingsSchema.parse({})
}

type JsonObject = { [key: string]: Json | undefined }
const isJsonObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Changes to some settings, by section: { focus: { defaultMode: 'deep' } }. */
export type SettingsPatch = Record<string, JsonObject>

/** The saved settings with `patch` put in, one level deep: everything else stays as it was. */
export function mergeSettings(saved: Json | undefined, patch: SettingsPatch): JsonObject {
  const base = isJsonObject(saved) ? saved : {}
  const merged: JsonObject = { ...base }
  for (const [section, values] of Object.entries(patch)) {
    const current = base[section]
    merged[section] = { ...(isJsonObject(current) ? current : {}), ...values }
  }
  return merged
}

/** Best focus hours: the student's own choice, or the default for their rhythm. */
export function peakWindowFor(settings: Settings, chronotype: Chronotype): { start: string; end: string } {
  const { peakStart, peakEnd } = settings.planner
  // 'HH:MM' text sorts like the time it stands for, so < works here.
  if (peakStart && peakEnd && peakStart < peakEnd) return { start: peakStart, end: peakEnd }
  const fallback = PEAK_WINDOWS[chronotype]
  return { start: formatTime(fallback.start), end: formatTime(fallback.end) }
}

/** The planner's settings for this student. */
export function plannerSettingsFor(settings: Settings, chronotype: Chronotype): Partial<PlannerSettings> {
  const peak = peakWindowFor(settings, chronotype)
  return {
    budget: settings.budget,
    bufferPct: settings.planner.bufferPct,
    revisionDays: settings.planner.revisionDays,
    maxReviewMinutes: settings.planner.maxReviewMinutes,
    maxDailyIncreasePct: settings.planner.maxDailyIncreasePct,
    peakWindow: { start: parseTime(peak.start), end: parseTime(peak.end) },
  }
}

const OTHER_AREAS: Record<Area, [Area, Area]> = {
  academics: ['hustle', 'life'],
  hustle: ['academics', 'life'],
  life: ['academics', 'hustle'],
}

const toStep = (value: number) => Math.round(value / 5) * 5

/**
 * Moves one budget slider (in steps of 5). The other two share what's left in their current
 * proportion, so the three always add up to 100.
 */
export function rebalanceBudget(budget: Budget, area: Area, value: number): Budget {
  const fixed = Math.min(100, Math.max(0, toStep(value)))
  const [first, second] = OTHER_AREAS[area]
  const rest = 100 - fixed
  const othersTotal = budget[first] + budget[second]
  const firstShare = othersTotal === 0 ? toStep(rest / 2) : toStep((rest * budget[first]) / othersTotal)
  const firstValue = Math.min(rest, Math.max(0, firstShare))
  const result: Budget = { ...budget }
  result[area] = fixed
  result[first] = firstValue
  result[second] = rest - firstValue
  return result
}
