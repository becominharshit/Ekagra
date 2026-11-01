import { formatTime, parseTime } from '@/features/planner/time'
import type { Budget, Chronotype } from '@/features/planner/types'
import type { OnboardingResult, ProfileRow, RoutineRow } from '@/features/profile/queries'
import {
  deviceTimezone,
  peakWindowFor,
  readSettings,
  toChronotype,
  toMentorTone,
  type MentorTone,
} from '@/features/profile/settings'
import type { Json } from '@/types/database'
import { routineToRows, rowsToRoutine, validateRoutine, type RoutineDraft } from './routineDraft'

// The whole onboarding form: filled in from what's saved, checked step by step,
// and turned into what gets saved. Pure functions, tested on their own.

/** Step 1: who you are. */
export interface AboutDraft {
  fullName: string
  college: string
  program: string
  year: number | null
  semester: number | null
}

/** Step 3: when you think best, and how your mentor should talk to you. */
export interface RhythmDraft {
  chronotype: Chronotype
  /** Best focus hours, 'HH:MM'. Hard topics are planned here. */
  peakStart: string
  peakEnd: string
  mentorTone: MentorTone
}

export interface OnboardingDraft {
  about: AboutDraft
  /** Step 2 */
  routine: RoutineDraft
  rhythm: RhythmDraft
  /** Step 4 */
  budget: Budget
}

/** The form, filled in from what's saved (or sensible defaults the first time). */
export function draftFrom(profile: ProfileRow, routineRows: RoutineRow[]): OnboardingDraft {
  const settings = readSettings(profile.settings)
  const chronotype = toChronotype(profile.chronotype)
  const peak = peakWindowFor(settings, chronotype)
  return {
    about: {
      fullName: profile.full_name ?? '',
      college: profile.college ?? '',
      program: profile.program ?? '',
      year: profile.year,
      semester: profile.semester,
    },
    routine: rowsToRoutine(routineRows),
    rhythm: { chronotype, peakStart: peak.start, peakEnd: peak.end, mentorTone: toMentorTone(profile.mentor_tone) },
    budget: settings.budget,
  }
}

function aboutProblems(about: AboutDraft): string[] {
  return about.fullName.trim() ? [] : ['Please enter your name.']
}

function rhythmProblems(rhythm: RhythmDraft): string[] {
  try {
    const length = parseTime(rhythm.peakEnd) - parseTime(rhythm.peakStart)
    return length >= 60 ? [] : ['Your best focus hours should be at least 1 hour long and end after they start.']
  } catch {
    return ['Pick a start and an end time for your best focus hours.']
  }
}

/** What to fix before leaving a step (0 = About you … 3 = Time budget), in plain words. */
export function problemsFor(step: number, draft: OnboardingDraft): string[] {
  if (step === 0) return aboutProblems(draft.about)
  if (step === 1) return validateRoutine(draft.routine)
  if (step === 2) return rhythmProblems(draft.rhythm)
  return [] // the budget sliders always add up to 100, so step 4 can't be wrong
}

/** Everything to fix in the whole form. Checked once more just before saving. */
export function allProblems(draft: OnboardingDraft): string[] {
  return [aboutProblems(draft.about), validateRoutine(draft.routine), rhythmProblems(draft.rhythm)].flat()
}

function isJsonObject(value: Json | undefined): value is { [key: string]: Json | undefined } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** '18:00:00' → '18:00', the form the settings expect. */
const hhmm = (time: string) => formatTime(parseTime(time))

/** The answers → what gets saved. Settings this form doesn't touch are kept as they are. */
export function resultFrom(
  draft: OnboardingDraft,
  profile: ProfileRow,
  now: Date = new Date(),
  timezone: string = deviceTimezone(),
): OnboardingResult {
  const saved = isJsonObject(profile.settings) ? profile.settings : {}
  const savedPlanner = isJsonObject(saved.planner) ? saved.planner : {}
  return {
    profile: {
      full_name: draft.about.fullName.trim(),
      college: draft.about.college.trim() || null,
      program: draft.about.program.trim() || null,
      year: draft.about.year,
      semester: draft.about.semester,
      timezone,
      chronotype: draft.rhythm.chronotype,
      mentor_tone: draft.rhythm.mentorTone,
      settings: {
        ...saved,
        budget: { ...draft.budget },
        planner: { ...savedPlanner, peakStart: hhmm(draft.rhythm.peakStart), peakEnd: hhmm(draft.rhythm.peakEnd) },
      },
      // Editing later keeps the first onboarding date.
      onboarded_at: profile.onboarded_at ?? now.toISOString(),
    },
    routine: routineToRows(draft.routine),
  }
}
