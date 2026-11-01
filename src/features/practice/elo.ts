// Adaptive difficulty with Elo ratings (docs/2-technical-design.md §9), the way chess ranks players:
// the student has a rating per subject and every question has one. An answer moves both a little;
// a surprise (a hard question right, an easy one wrong) moves them more.
//   expected success  E = 1 / (1 + 10^((Rq − Rs) / 400))
//   after an answer   Rs += K × (result − E)    K = 24, then 16 after 50 answers
//                     Rq −= 8 × (result − E)
// Practice asks the questions with E closest to 0.7: hard enough to grow, easy enough to keep going.
// Pure functions, tested on their own.

export const START_RATING = 1000
export const TARGET_SUCCESS = 0.7

/** A question's first rating from its difficulty 1–5. */
const DIFFICULTY_RATING = [800, 900, 1000, 1100, 1200]
const QUESTION_K = 8
/** The database's limits for subject_ratings.rating (005_adaptive.sql). */
const MIN_RATING = 100
const MAX_RATING = 3000

const clamp = (value: number) => Math.min(MAX_RATING, Math.max(MIN_RATING, value))

export function startingQuestionRating(difficulty: number | null): number {
  const level = Math.min(5, Math.max(1, Math.round(difficulty ?? 3)))
  return DIFFICULTY_RATING[level - 1] ?? START_RATING
}

/** The question's own rating once it has one, else the one its difficulty gives. */
export function questionRating(question: { rating: number | null; difficulty: number | null }): number {
  return question.rating ?? startingQuestionRating(question.difficulty)
}

/** The chance (0–1) that a student with this rating gets a question with that rating right. */
export function expectedSuccess(studentRating: number, questionRatingValue: number): number {
  return 1 / (1 + 10 ** ((questionRatingValue - studentRating) / 400))
}

/** How far one answer moves the student's rating: more while there are few answers to go on. */
export function kFactor(answers: number): number {
  return answers >= 50 ? 16 : 24
}

export interface RatedAnswer {
  /** The student's rating in this subject before the answer. */
  student: number
  question: number
  /** Answers the student gave in this subject before this one. */
  answers: number
  right: boolean
}

/** The new ratings after an answer: the student's to one decimal, the question's whole (as stored). */
export function rateAnswer({ student, question, answers, right }: RatedAnswer): { student: number; question: number } {
  const surprise = (right ? 1 : 0) - expectedSuccess(student, question)
  return {
    student: Math.round(clamp(student + kFactor(answers) * surprise) * 10) / 10,
    question: Math.round(clamp(question - QUESTION_K * surprise)),
  }
}

export interface Candidate {
  id: string
  rating: number | null
  difficulty: number | null
}

/**
 * The question to ask next: the one whose chance of success is closest to 70%. Questions already
 * asked in this session are skipped; ones answered in the last day (or week) come later.
 * Ties go to the smaller id, so the choice is always the same for the same data.
 */
export function pickNext<T extends Candidate>(
  candidates: T[],
  studentRating: number,
  { skip = new Set<string>(), lastAnswered = new Map<string, number>(), now }: { skip?: ReadonlySet<string>; lastAnswered?: ReadonlyMap<string, number>; now: number },
): T | null {
  let best: T | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const question of candidates) {
    if (skip.has(question.id)) continue
    const fit = Math.abs(expectedSuccess(studentRating, questionRating(question)) - TARGET_SUCCESS)
    const last = lastAnswered.get(question.id)
    const hours = last === undefined ? Number.POSITIVE_INFINITY : (now - last) / 3_600_000
    const score = fit + (hours < 24 ? 0.5 : hours < 24 * 7 ? 0.15 : 0)
    if (score < bestScore - 1e-12 || (Math.abs(score - bestScore) <= 1e-12 && best !== null && question.id < best.id)) {
      best = question
      bestScore = score
    }
  }
  return best
}

/** A rating in words, for the student (1000 = where everyone starts). */
export function ratingLabel(rating: number): string {
  if (rating >= 1200) return 'Strong'
  if (rating >= 1080) return 'Good'
  if (rating >= 920) return 'Getting there'
  return 'Building up'
}
