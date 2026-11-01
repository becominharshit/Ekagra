import { describe, expect, it } from 'vitest'
import type { ProfileRow, RoutineRow } from '@/features/profile/queries'
import { allProblems, draftFrom, problemsFor, resultFrom } from './onboardingDraft'
import { routineToRows } from './routineDraft'

// The settings every new profile gets from the database (supabase/migrations/001_phase1_core.sql).
const DATABASE_SETTINGS = {
  budget: { academics: 55, hustle: 25, life: 20 },
  planner: { bufferPct: 12, revisionDays: 10, maxReviewMinutes: 30, maxDailyIncreasePct: 20 },
  focus: { pomodoro: { work: 25, break: 5 }, deep: { work: 50, break: 10 }, blockDuring: 'focus_sessions' },
  tollbooth: { questions: 3, unlockMinutes: 3, dailyLimit: 3 },
  learning: { newCardsPerDay: 20, targetRetention: 0.9, language: 'en' },
  theme: 'system',
}

const NOW = new Date('2026-11-01T10:00:00Z')

/** A profile as the sign-up trigger creates it. */
function newProfile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: 'user-1',
    full_name: 'Asha Verma',
    avatar_url: null,
    college: null,
    program: null,
    year: null,
    semester: null,
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    chronotype: 'neutral',
    mentor_tone: 'balanced',
    onboarded_at: null,
    settings: DATABASE_SETTINGS,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    ...overrides,
  }
}

describe('draftFrom', () => {
  it('starts a new profile with its name, the default week and the 55 / 25 / 20 budget', () => {
    const draft = draftFrom(newProfile(), [])
    expect(draft.about).toEqual({ fullName: 'Asha Verma', college: '', program: '', year: null, semester: null })
    expect(draft.routine.classes).toHaveLength(1)
    expect(draft.rhythm).toEqual({ chronotype: 'neutral', peakStart: '09:00', peakEnd: '13:00', mentorTone: 'balanced' })
    expect(draft.budget).toEqual({ academics: 55, hustle: 25, life: 20 })
  })
})

describe('problemsFor', () => {
  it('needs a name on step 1', () => {
    const draft = draftFrom(newProfile({ full_name: null }), [])
    expect(problemsFor(0, draft)).toEqual(['Please enter your name.'])
    draft.about.fullName = '   '
    expect(problemsFor(0, draft)).toEqual(['Please enter your name.'])
  })

  it('needs best focus hours of at least 1 hour on step 3', () => {
    const draft = draftFrom(newProfile(), [])
    draft.rhythm.peakStart = '20:00'
    draft.rhythm.peakEnd = '20:30'
    expect(problemsFor(2, draft)).toHaveLength(1)
    draft.rhythm.peakEnd = '19:00'
    expect(problemsFor(2, draft)).toHaveLength(1)
    draft.rhythm.peakEnd = ''
    expect(problemsFor(2, draft)).toEqual(['Pick a start and an end time for your best focus hours.'])
    draft.rhythm.peakEnd = '21:00'
    expect(problemsFor(2, draft)).toEqual([])
  })

  it('checks every step once more before saving', () => {
    expect(allProblems(draftFrom(newProfile(), []))).toEqual([])

    const draft = draftFrom(newProfile({ full_name: '' }), [])
    draft.routine.wake = ''
    expect(allProblems(draft)).toEqual(['Please enter your name.', 'Pick both a wake-up time and a bedtime.'])
  })
})

describe('resultFrom', () => {
  it('saves the answers, marks the profile as onboarded and keeps the settings it does not touch', () => {
    const draft = draftFrom(newProfile(), [])
    draft.about = { fullName: '  Asha  ', college: ' IIT Delhi ', program: '', year: 2, semester: 3 }
    draft.rhythm = { chronotype: 'night', peakStart: '19:00', peakEnd: '22:30', mentorTone: 'strict' }
    draft.budget = { academics: 60, hustle: 20, life: 20 }

    const result = resultFrom(draft, newProfile(), NOW, 'Europe/London')

    expect(result.profile).toEqual({
      full_name: 'Asha',
      college: 'IIT Delhi',
      program: null,
      year: 2,
      semester: 3,
      timezone: 'Europe/London',
      chronotype: 'night',
      mentor_tone: 'strict',
      settings: {
        ...DATABASE_SETTINGS,
        budget: { academics: 60, hustle: 20, life: 20 },
        planner: { ...DATABASE_SETTINGS.planner, peakStart: '19:00', peakEnd: '22:30' },
      },
      onboarded_at: '2026-11-01T10:00:00.000Z',
    })
    expect(result.routine).toEqual(routineToRows(draft.routine))
  })

  it('keeps the first onboarding date when the answers are edited later', () => {
    const profile = newProfile({ onboarded_at: '2026-09-01T08:00:00+00:00' })
    const result = resultFrom(draftFrom(profile, []), profile, NOW, 'Asia/Kolkata')
    expect(result.profile.onboarded_at).toBe('2026-09-01T08:00:00+00:00')
  })

  it('shows the same answers again when editing later', () => {
    const draft = draftFrom(newProfile(), [])
    draft.rhythm = { chronotype: 'early', peakStart: '06:00', peakEnd: '09:00', mentorTone: 'friendly' }
    draft.budget = { academics: 70, hustle: 10, life: 20 }
    draft.routine.gym = { id: 'gym', title: 'Gym', days: [1, 3, 5], start: '18:00', end: '19:00' }
    const result = resultFrom(draft, newProfile(), NOW, 'Asia/Kolkata')

    // What the database gives back: the updated profile, and routine rows with ids and seconds on the times.
    const savedProfile: ProfileRow = { ...newProfile(), ...result.profile }
    const savedRows: RoutineRow[] = result.routine.map((row, index) => ({
      ...row,
      id: `row-${index}`,
      user_id: 'user-1',
      start_time: `${row.start_time}:00`,
      end_time: `${row.end_time}:00`,
      valid_from: null,
      valid_to: null,
      created_at: NOW.toISOString(),
      updated_at: NOW.toISOString(),
    }))

    const again = draftFrom(savedProfile, savedRows)
    expect(again.rhythm).toEqual(draft.rhythm)
    expect(again.budget).toEqual(draft.budget)
    expect(routineToRows(again.routine)).toEqual(result.routine)
  })
})
