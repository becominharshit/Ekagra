// Grades maths for Indian universities (CBCS): a grade scale turns letters into points, and the
// SGPA and CGPA are averages weighted by credits:
//   SGPA = Σ (credits × grade points) ÷ Σ credits          over this semester's subjects
//   CGPA = Σ (semester credits × SGPA) ÷ Σ semester credits over all semesters
// Pure functions, tested on their own. The scale lives in profiles.settings.grades and can be edited.

/** A type (not an interface) so it can be saved as JSON in the settings. */
export type GradeStep = {
  /** e.g. 'A+' */
  letter: string
  /** Grade points, e.g. 9 */
  points: number
  /** The lowest total % for this grade (used to suggest a grade from marks). */
  minPercent: number
}

/** The usual 10-point scale (UGC CBCS). Universities set their own % cut-offs, so the scale can be edited. */
export const DEFAULT_GRADE_SCALE: GradeStep[] = [
  { letter: 'O', points: 10, minPercent: 90 },
  { letter: 'A+', points: 9, minPercent: 80 },
  { letter: 'A', points: 8, minPercent: 70 },
  { letter: 'B+', points: 7, minPercent: 60 },
  { letter: 'B', points: 6, minPercent: 50 },
  { letter: 'C', points: 5, minPercent: 45 },
  { letter: 'P', points: 4, minPercent: 40 },
  { letter: 'F', points: 0, minPercent: 0 },
]

/** Room for rounding: 0.1 + 0.2 isn't exactly 0.3 in JavaScript. */
const EPSILON = 1e-9

export function gradePoints(scale: GradeStep[], letter: string | null): number | null {
  if (!letter) return null
  return scale.find((step) => step.letter === letter)?.points ?? null
}

/** The grade a total % would give (the step with the highest cut-off it reaches), or null. */
export function gradeForPercent(scale: GradeStep[], percent: number | null): GradeStep | null {
  if (percent === null) return null
  return [...scale].sort((a, b) => b.minPercent - a.minPercent).find((step) => percent + EPSILON >= step.minPercent) ?? null
}

export interface GradedSubject {
  credits: number | null
  grade: string | null
}

export interface SgpaResult {
  sgpa: number | null
  /** Credits of the subjects that count (credits and a known grade). */
  credits: number
  /** Subjects with credits but without a grade yet. */
  missing: number
}

export function sgpa(subjects: GradedSubject[], scale: GradeStep[]): SgpaResult {
  let credits = 0
  let points = 0
  let missing = 0
  for (const subject of subjects) {
    const subjectCredits = Number(subject.credits ?? 0)
    if (subjectCredits <= 0) continue
    const grade = gradePoints(scale, subject.grade)
    if (grade === null) {
      missing += 1
      continue
    }
    credits += subjectCredits
    points += subjectCredits * grade
  }
  return { sgpa: credits > 0 ? points / credits : null, credits, missing }
}

export interface SemesterResult {
  credits: number
  sgpa: number
}

/** Credit-weighted CGPA, or null without any semester. */
export function cgpa(semesters: SemesterResult[]): { cgpa: number | null; credits: number } {
  let credits = 0
  let points = 0
  for (const semester of semesters) {
    const semesterCredits = Number(semester.credits)
    if (semesterCredits <= 0) continue
    credits += semesterCredits
    points += semesterCredits * Number(semester.sgpa)
  }
  return { cgpa: credits > 0 ? points / credits : null, credits }
}

/**
 * The SGPA this semester needs for the CGPA to reach `target`, given the earlier semesters.
 * It can come out above the scale's maximum (not reachable this semester) or below 0 (already safe).
 */
export function requiredSgpa(target: number, earlier: SemesterResult[], currentCredits: number): number | null {
  if (currentCredits <= 0) return null
  const before = cgpa(earlier)
  const earlierPoints = (before.cgpa ?? 0) * before.credits
  return (target * (before.credits + currentCredits) - earlierPoints) / currentCredits
}

/** Two decimals, the way marksheets show a GPA (rounded, 8.456 → 8.46). */
export function gpaLabel(value: number | null): string {
  return value === null ? '–' : (Math.round(value * 100 + EPSILON) / 100).toFixed(2)
}

export interface MarkLike {
  obtained: number
  max_marks: number
}

/** All marks of a subject added up: obtained, out of, and the %. */
export function marksTotal(marks: MarkLike[]): { obtained: number; max: number; percent: number | null } {
  const obtained = marks.reduce((sum, mark) => sum + Number(mark.obtained), 0)
  const max = marks.reduce((sum, mark) => sum + Number(mark.max_marks), 0)
  return { obtained, max, percent: max > 0 ? (obtained / max) * 100 : null }
}

/** Problems with an edited scale, in plain words (empty = fine). */
export function scaleProblems(scale: GradeStep[]): string[] {
  const problems: string[] = []
  if (scale.length < 2) problems.push('A scale needs at least two grades.')
  const letters = scale.map((step) => step.letter.trim())
  if (letters.some((letter) => letter === '' || letter.length > 4)) problems.push('Each grade needs a short name (1 to 4 characters), e.g. A+.')
  if (new Set(letters).size !== letters.length) problems.push('Two grades have the same name.')
  if (scale.some((step) => !Number.isFinite(step.points) || step.points < 0 || step.points > 10)) problems.push('Grade points go from 0 to 10.')
  if (scale.some((step) => !Number.isFinite(step.minPercent) || step.minPercent < 0 || step.minPercent > 100)) problems.push('Cut-offs go from 0 to 100%.')
  return problems
}
