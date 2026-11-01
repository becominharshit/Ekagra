import type { Question, QuestionType } from '@/features/academics/pastPapers'
import { isCheckQuestion, readCheckQuestion, type StoredCheckQuestion } from '@/features/lessons/quiz'
import { median } from '@/features/metrics/metrics'

// Mock tests copy the exam's pattern from the subject's past papers: how many questions of each
// type and marks a paper usually has (say 4 short answers of 5 marks and 2 long answers of 10).
// The test is filled with past-paper questions, plus lesson check questions for multiple choice
// and numericals (the app can mark those itself), and timed at 1.8 minutes per mark (a 100-mark
// paper gets 3 hours). Pure functions, tested on their own.

export const QUESTION_TYPES = ['mcq', 'numerical', 'short', 'long', 'code'] as const satisfies readonly QuestionType[]

export const SECTION_LABEL: Record<QuestionType, string> = {
  mcq: 'Multiple choice',
  numerical: 'Numericals',
  short: 'Short answers',
  long: 'Long answers',
  code: 'Programs',
}

/** Marks for a past-paper question whose marks couldn't be read. */
const DEFAULT_MARKS: Record<QuestionType, number> = { mcq: 1, numerical: 5, short: 5, long: 10, code: 10 }

export const MINUTES_PER_MARK = 1.8

/** The two question types the app marks itself (when they come from lessons, with an answer key). */
const MARKED_BY_APP = new Set<QuestionType>(['mcq', 'numerical'])

export function toQuestionType(value: string): QuestionType {
  return (QUESTION_TYPES as readonly string[]).includes(value) ? (value as QuestionType) : 'short'
}

/** One section of the pattern: `count` questions of this type, `marks` each. */
export interface PatternGroup {
  type: QuestionType
  marks: number
  count: number
}

export interface ExamPattern {
  /** Smaller questions first, the way papers are usually set. */
  groups: PatternGroup[]
  totalMarks: number
  minutes: number
  /** How many past papers it comes from. */
  papers: number
}

/** 1.8 minutes per mark, rounded to 5 minutes (at least 10). */
export function mockMinutes(marks: number): number {
  return Math.max(10, Math.round((marks * MINUTES_PER_MARK) / 5) * 5)
}

const groupKey = (type: QuestionType, marks: number) => `${type}|${marks}`
const paperOrder = (a: PatternGroup, b: PatternGroup) => a.marks - b.marks || QUESTION_TYPES.indexOf(a.type) - QUESTION_TYPES.indexOf(b.type)

function withTotals(groups: PatternGroup[], papers: number): ExamPattern {
  const sorted = groups.filter((group) => group.count > 0).sort(paperOrder)
  const totalMarks = sorted.reduce((sum, group) => sum + group.marks * group.count, 0)
  return { groups: sorted, totalMarks, minutes: mockMinutes(totalMarks), papers }
}

function questionMarks(question: Pick<Question, 'type' | 'marks'>): number {
  const marks = Number(question.marks ?? 0)
  return marks > 0 ? marks : DEFAULT_MARKS[toQuestionType(question.type)]
}

/**
 * The usual paper: for each kind of question (type and marks), the median count over the past
 * papers. Null without past-paper questions.
 */
export function examPattern(questions: Pick<Question, 'past_paper_id' | 'type' | 'marks'>[]): ExamPattern | null {
  const papers = new Map<string, Map<string, PatternGroup>>()
  for (const question of questions) {
    if (!question.past_paper_id) continue
    const type = toQuestionType(question.type)
    const marks = questionMarks(question)
    const groups = papers.get(question.past_paper_id) ?? new Map<string, PatternGroup>()
    const group = groups.get(groupKey(type, marks)) ?? { type, marks, count: 0 }
    group.count += 1
    groups.set(groupKey(type, marks), group)
    papers.set(question.past_paper_id, groups)
  }
  if (papers.size === 0) return null

  const kinds = new Map<string, PatternGroup>()
  for (const groups of papers.values()) for (const [key, group] of groups) kinds.set(key, group)
  const typical = [...kinds].map(([key, group]) => ({
    type: group.type,
    marks: group.marks,
    count: Math.round(median([...papers.values()].map((groups) => groups.get(key)?.count ?? 0)) ?? 0),
  }))
  const pattern = withTotals(typical, papers.size)
  if (pattern.groups.length > 0) return pattern
  // The papers have nothing in common: use the biggest one.
  const [biggest] = [...papers.values()].map((groups) => withTotals([...groups.values()], papers.size)).sort((a, b) => b.totalMarks - a.totalMarks)
  return biggest ?? null
}

/** A shorter test with the same mix: about `share` of the questions (the biggest remainders get the rest). */
export function scalePattern(pattern: ExamPattern, share: number): ExamPattern {
  if (share >= 1) return pattern
  const total = pattern.groups.reduce((sum, group) => sum + group.count, 0)
  const target = Math.max(1, Math.round(total * share))
  const exact = pattern.groups.map((group) => group.count * share)
  const counts = exact.map((value) => Math.floor(value))
  const byRemainder = exact.map((value, index) => ({ index, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest || a.index - b.index)
  let left = target - counts.reduce((sum, count) => sum + count, 0)
  for (const { index } of byRemainder) {
    if (left <= 0) break
    counts[index] = (counts[index] ?? 0) + 1
    left -= 1
  }
  return withTotals(
    pattern.groups.map((group, index) => ({ ...group, count: counts[index] ?? 0 })),
    pattern.papers,
  )
}

/** A question a mock test can use: from a past paper, or one of a lesson's check questions. */
export interface PoolQuestion {
  id: string
  topicId: string | null
  type: QuestionType
  /** Past-paper marks; null for check questions. */
  marks: number | null
  prompt: string
  /** A check question's answer key; null for past-paper questions (they have none). */
  check: StoredCheckQuestion | null
}

/** The subject's past-paper questions and check questions, ready for mock tests. */
export function mockPool(rows: Question[]): PoolQuestion[] {
  return rows.flatMap((row): PoolQuestion[] => {
    if (row.source === 'pyq') {
      return [{ id: row.id, topicId: row.topic_id, type: toQuestionType(row.type), marks: row.marks === null ? null : Number(row.marks), prompt: row.prompt, check: null }]
    }
    if (!isCheckQuestion(row)) return []
    const check = readCheckQuestion(row)
    return check ? [{ id: row.id, topicId: row.topic_id, type: check.type, marks: null, prompt: row.prompt, check }] : []
  })
}

/** A question in a mock test. A type (not an interface) so it can be kept as JSON on the device. */
export type MockQuestion = {
  id: string
  topicId: string | null
  /** Its section. */
  type: QuestionType
  /** Marks in this test (the section's). */
  marks: number
  prompt: string
  check: StoredCheckQuestion | null
}

/** Multiple choice and numericals from lessons: the app marks them. Everything else is a written answer. */
export function isAutoMarked(question: Pick<MockQuestion, 'check'>): boolean {
  return question.check !== null && question.check.type !== 'short'
}

/** How well a question fits a section of the pattern: 0 is best, null doesn't fit. */
function fit(question: PoolQuestion, group: PatternGroup): number | null {
  const appMarks = MARKED_BY_APP.has(group.type)
  if (question.check) {
    if (appMarks) return question.check.type === group.type ? 0 : null
    return group.type === 'short' && question.check.type === 'short' ? 3 : null
  }
  const sameMarks = question.marks === group.marks
  if (question.type === group.type) return (appMarks ? 1 : 0) + (sameMarks ? 0 : 1)
  // Another written type with the same marks, e.g. a 10-mark long answer for a 10-mark program.
  return !appMarks && !MARKED_BY_APP.has(question.type) && sameMarks ? 2 : null
}

export interface MockChoice {
  /** Times each question was in an earlier mock test: fresh ones come first. */
  used?: ReadonlyMap<string, number>
  /** Topic priority (0–1): important topics come first. */
  priority?: ReadonlyMap<string, number>
  /** Syllabus order of the topics: each section follows it. */
  topicOrder?: ReadonlyMap<string, number>
}

export interface MockTest {
  questions: MockQuestion[]
  totalMarks: number
  minutes: number
  /** Questions the pattern asks for that the subject doesn't have. */
  missing: number
}

/**
 * Fills the pattern. The best-fitting questions are placed first in every section (so a long
 * answer isn't used up as a program while the long-answer section still needs it); among equally
 * good ones, questions not used in earlier mocks and important topics win.
 */
export function buildMockTest(pattern: ExamPattern, pool: PoolQuestion[], { used = new Map(), priority = new Map(), topicOrder = new Map() }: MockChoice = {}): MockTest {
  const taken = new Set<string>()
  const picked = pattern.groups.map((): PoolQuestion[] => [])
  const fresher = (a: PoolQuestion, b: PoolQuestion) =>
    (used.get(a.id) ?? 0) - (used.get(b.id) ?? 0) || (priority.get(b.topicId ?? '') ?? 0) - (priority.get(a.topicId ?? '') ?? 0) || a.id.localeCompare(b.id)

  for (let rank = 0; rank <= 3; rank++) {
    pattern.groups.forEach((group, index) => {
      const chosen = picked[index] ?? []
      const need = group.count - chosen.length
      if (need <= 0) return
      const candidates = pool.filter((question) => !taken.has(question.id) && fit(question, group) === rank).sort(fresher)
      for (const question of candidates.slice(0, need)) {
        taken.add(question.id)
        chosen.push(question)
      }
    })
  }

  const order = (question: PoolQuestion) => topicOrder.get(question.topicId ?? '') ?? Number.MAX_SAFE_INTEGER
  const questions = pattern.groups.flatMap((group, index) =>
    [...(picked[index] ?? [])]
      .sort((a, b) => order(a) - order(b))
      .map((question): MockQuestion => ({ id: question.id, topicId: question.topicId, type: group.type, marks: group.marks, prompt: question.prompt, check: question.check })),
  )
  const totalMarks = questions.reduce((sum, question) => sum + question.marks, 0)
  const wanted = pattern.groups.reduce((sum, group) => sum + group.count, 0)
  return { questions, totalMarks, minutes: mockMinutes(totalMarks), missing: wanted - questions.length }
}

/** "4 × 5 marks" */
export function groupLabel(group: Pick<PatternGroup, 'count' | 'marks'>): string {
  return `${group.count} × ${group.marks} ${group.marks === 1 ? 'mark' : 'marks'}`
}
