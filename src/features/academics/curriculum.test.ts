import { describe, expect, it } from 'vitest'
import { scaleProblems } from '@/features/grades/gpa'
import {
  CURRICULUM_LIST,
  CURRICULUM_PROFILES,
  curriculumForProfile,
  getCurriculumProfile,
  recommendedCurriculumForLocale,
} from './curriculum'

describe('curriculum profiles', () => {
  it('defines valid grade scales within the database 0..10 range', () => {
    expect(CURRICULUM_LIST).toHaveLength(6)
    for (const profile of CURRICULUM_LIST) {
      expect(scaleProblems(profile.defaultGradeScale)).toEqual([])
      expect(profile.maxGradePoints).toBeGreaterThan(0)
      expect(profile.maxGradePoints).toBeLessThanOrEqual(10)
    }
  })

  it('recommends a region-appropriate curriculum profile', () => {
    expect(recommendedCurriculumForLocale('America/New_York', 'en-US')).toBe('us_gpa')
    expect(recommendedCurriculumForLocale('Europe/London', 'en-GB')).toBe('uk_honours')
    expect(recommendedCurriculumForLocale('Europe/Berlin', 'de-DE')).toBe('eu_ects')
    expect(recommendedCurriculumForLocale('Asia/Kolkata', 'en-IN')).toBe('india_engineering')
    expect(recommendedCurriculumForLocale('Asia/Tokyo', 'ja-JP')).toBe('custom')
  })

  it('resolves the active curriculum from saved settings or falls back safely', () => {
    expect(getCurriculumProfile('us_gpa').termLabel).toBe('Term GPA')
    expect(getCurriculumProfile('unknown').id).toBe('custom')

    expect(
      curriculumForProfile({
        timezone: 'America/Chicago',
        settings: { grades: { curriculum: 'uk_honours', scale: CURRICULUM_PROFILES.uk_honours.defaultGradeScale } },
      }).id,
    ).toBe('uk_honours')

    expect(
      curriculumForProfile({
        timezone: 'America/Chicago',
        settings: { grades: { scale: CURRICULUM_PROFILES.us_gpa.defaultGradeScale } },
      }).id,
    ).toBe('us_gpa')

    expect(curriculumForProfile({ timezone: 'Europe/Paris', settings: {} }).id).toBe('custom')
  })
})
