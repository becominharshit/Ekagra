import { z } from 'zod'
import { PEAK_WINDOWS, STANDARD_BUDGET } from '@/features/planner/planner'
import { formatTime, parseTime } from '@/features/planner/time'
import type { Area, Budget, Chronotype, PlannerSettings } from '@/features/planner/types'

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

export const settingsSchema = z.looseObject({
  budget: budgetSchema.catch(() => ({ ...STANDARD_BUDGET })),
  planner: plannerSchema.catch(() => plannerSchema.parse({})),
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
