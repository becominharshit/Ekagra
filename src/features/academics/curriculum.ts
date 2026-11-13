import { DEFAULT_GRADE_SCALE, type GradeStep } from '@/features/grades/gpa'
import { useProfile } from '@/features/profile/queries'
import { CURRICULUM_IDS, readSettings, type CurriculumId } from '@/features/profile/settings'
import { browserLocale } from '@/lib/currency'
import { browserTimezone } from '@/lib/timezone'

export interface CurriculumProfile {
  id: CurriculumId
  label: string
  shortLabel: string
  description: string
  programPlaceholder: string
  termLabel: string
  cumulativeLabel: string
  creditsLabel: string
  maxGradePoints: number
  defaultGradeScale: GradeStep[]
}

export const US_GPA_SCALE: GradeStep[] = [
  { letter: 'A', points: 4, minPercent: 93 },
  { letter: 'A-', points: 3.7, minPercent: 90 },
  { letter: 'B+', points: 3.3, minPercent: 87 },
  { letter: 'B', points: 3, minPercent: 83 },
  { letter: 'B-', points: 2.7, minPercent: 80 },
  { letter: 'C+', points: 2.3, minPercent: 77 },
  { letter: 'C', points: 2, minPercent: 73 },
  { letter: 'C-', points: 1.7, minPercent: 70 },
  { letter: 'D', points: 1, minPercent: 60 },
  { letter: 'F', points: 0, minPercent: 0 },
]

export const UK_HONOURS_SCALE: GradeStep[] = [
  { letter: '1st', points: 4, minPercent: 70 },
  { letter: '2:1', points: 3.3, minPercent: 60 },
  { letter: '2:2', points: 2.7, minPercent: 50 },
  { letter: '3rd', points: 2, minPercent: 40 },
  { letter: 'Pass', points: 1, minPercent: 35 },
  { letter: 'Fail', points: 0, minPercent: 0 },
]

export const EU_ECTS_SCALE: GradeStep[] = [
  { letter: 'A', points: 4, minPercent: 90 },
  { letter: 'B', points: 3.3, minPercent: 80 },
  { letter: 'C', points: 2.7, minPercent: 70 },
  { letter: 'D', points: 2, minPercent: 60 },
  { letter: 'E', points: 1, minPercent: 50 },
  { letter: 'FX', points: 0, minPercent: 35 },
  { letter: 'F', points: 0, minPercent: 0 },
]

export const IB_SCALE: GradeStep[] = [
  { letter: '7', points: 7, minPercent: 85 },
  { letter: '6', points: 6, minPercent: 73 },
  { letter: '5', points: 5, minPercent: 61 },
  { letter: '4', points: 4, minPercent: 50 },
  { letter: '3', points: 3, minPercent: 38 },
  { letter: '2', points: 2, minPercent: 25 },
  { letter: '1', points: 1, minPercent: 0 },
]

export const CURRICULUM_PROFILES: Record<CurriculumId, CurriculumProfile> = {
  us_gpa: {
    id: 'us_gpa',
    label: 'US University (4.0 GPA)',
    shortLabel: 'US 4.0 GPA',
    description: '4.0 GPA scale (A to F) with course credits and term/cumulative GPA.',
    programPlaceholder: 'e.g. B.S. Computer Science',
    termLabel: 'Term GPA',
    cumulativeLabel: 'Cumulative GPA',
    creditsLabel: 'Credits',
    maxGradePoints: 4,
    defaultGradeScale: US_GPA_SCALE,
  },
  uk_honours: {
    id: 'uk_honours',
    label: 'UK Honours',
    shortLabel: 'UK Honours',
    description: 'First, 2:1, 2:2, and 3rd class honours percentage thresholds.',
    programPlaceholder: 'e.g. BSc (Hons) Computer Science',
    termLabel: 'Term GPA',
    cumulativeLabel: 'Honours Average',
    creditsLabel: 'CATS / Credits',
    maxGradePoints: 4,
    defaultGradeScale: UK_HONOURS_SCALE,
  },
  eu_ects: {
    id: 'eu_ects',
    label: 'European ECTS',
    shortLabel: 'EU ECTS',
    description: 'ECTS credits and A–F grading scale for European universities.',
    programPlaceholder: 'e.g. BSc Informatics',
    termLabel: 'Term GPA',
    cumulativeLabel: 'ECTS GPA',
    creditsLabel: 'ECTS',
    maxGradePoints: 4,
    defaultGradeScale: EU_ECTS_SCALE,
  },
  ib_alevels: {
    id: 'ib_alevels',
    label: 'IB / A-Levels',
    shortLabel: 'IB / A-Levels',
    description: '7-point International Baccalaureate and pre-university subjects.',
    programPlaceholder: 'e.g. IB Diploma / A-Levels',
    termLabel: 'Term Average',
    cumulativeLabel: 'Overall Average',
    creditsLabel: 'Weight',
    maxGradePoints: 7,
    defaultGradeScale: IB_SCALE,
  },
  india_engineering: {
    id: 'india_engineering',
    label: 'India (JEE / GATE / B.Tech)',
    shortLabel: 'India 10-pt',
    description: '10-point CBCS grading scale with SGPA and CGPA.',
    programPlaceholder: 'e.g. B.Tech Computer Science',
    termLabel: 'SGPA',
    cumulativeLabel: 'CGPA',
    creditsLabel: 'Credits',
    maxGradePoints: 10,
    defaultGradeScale: DEFAULT_GRADE_SCALE,
  },
  custom: {
    id: 'custom',
    label: 'Custom scale',
    shortLabel: 'Custom',
    description: 'Define your own letters, grade points, and percentage cut-offs.',
    programPlaceholder: 'e.g. Computer Science',
    termLabel: 'Term GPA',
    cumulativeLabel: 'Cumulative GPA',
    creditsLabel: 'Credits',
    maxGradePoints: 10,
    defaultGradeScale: DEFAULT_GRADE_SCALE,
  },
}

export const CURRICULUM_LIST: CurriculumProfile[] = CURRICULUM_IDS.map((id) => CURRICULUM_PROFILES[id])

export function getCurriculumProfile(id: string | null | undefined): CurriculumProfile {
  if (id && id in CURRICULUM_PROFILES) {
    return CURRICULUM_PROFILES[id as CurriculumId]
  }
  return CURRICULUM_PROFILES.custom
}

export function recommendedCurriculumForLocale(timezone = browserTimezone(), locale = browserLocale()): CurriculumId {
  const tz = timezone.trim()
  if (tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta') return 'india_engineering'
  if (tz === 'Europe/London') return 'uk_honours'
  if (tz.startsWith('Europe/')) return 'eu_ects'
  if (tz.startsWith('America/')) return 'us_gpa'
  if (tz && tz !== 'UTC' && tz !== 'Etc/UTC') return 'custom'

  const upperLocale = locale.toUpperCase()
  if (upperLocale.endsWith('-IN') || upperLocale === 'EN-IN' || upperLocale === 'HI') {
    return 'india_engineering'
  }
  if (upperLocale.endsWith('-GB')) {
    return 'uk_honours'
  }
  if (
    upperLocale.endsWith('-DE') ||
    upperLocale.endsWith('-FR') ||
    upperLocale.endsWith('-ES') ||
    upperLocale.endsWith('-IT') ||
    upperLocale.endsWith('-NL') ||
    upperLocale.endsWith('-IE')
  ) {
    return 'eu_ects'
  }
  if (upperLocale.endsWith('-US') || upperLocale.endsWith('-CA')) {
    return 'us_gpa'
  }
  return 'custom'
}

export function curriculumForProfile(profile: { timezone?: string | null; settings?: unknown } | null | undefined): CurriculumProfile {
  const settings = readSettings(profile?.settings)
  if (settings.grades.curriculum) {
    return CURRICULUM_PROFILES[settings.grades.curriculum]
  }
  const maxPoints = Math.max(...settings.grades.scale.map((step) => step.points), 0)
  if (maxPoints <= 4.1) return CURRICULUM_PROFILES.us_gpa
  if (maxPoints <= 7.1) return CURRICULUM_PROFILES.ib_alevels
  const fallbackId = recommendedCurriculumForLocale(profile?.timezone ?? browserTimezone())
  if (fallbackId === 'india_engineering') return CURRICULUM_PROFILES.india_engineering
  return CURRICULUM_PROFILES.custom
}

export function useCurriculum(): CurriculumProfile {
  const profile = useProfile()
  return curriculumForProfile(profile.data)
}
