// Topic priority: which topics matter most for the exam.
//
//   priority = 0.45 × examWeight + 0.35 × pyqScore + 0.20 × dependentsScore
//
// Each part is scaled from 0 to 1 inside ONE subject, so the strongest topic of a subject
// gets 1 for that part:
//   - examWeight:      the topic's weight in the syllabus
//   - pyqScore:        half "how often it was asked in past papers" + half "its share of the marks"
//   - dependentsScore: how many other topics need this one, directly or through a chain

export interface PriorityInput {
  id: string
  /** 0–1 from the syllabus analysis. */
  examWeight: number
  /** How many times the topic was asked in past papers. */
  pyqCount: number
  /** 0–1: the topic's share of all past-paper marks. */
  pyqMarksShare: number
  /** Topics that must be learned before this one. */
  prerequisiteIds: string[]
}

export interface PriorityResult {
  /** 0–1, at most 4 decimals (fits topics.priority_score). */
  score: number
  examPart: number
  pyqPart: number
  dependentsPart: number
  /** How many topics depend on this one. */
  dependents: number
}

export const PRIORITY_WEIGHTS = { exam: 0.45, pyq: 0.35, dependents: 0.2 } as const

const scale = (value: number, max: number) => (max > 0 ? Math.max(0, value) / max : 0)
const round4 = (value: number) => Math.round(value * 10_000) / 10_000

/** For each topic: how many other topics need it, directly or through a chain.
 *  (C needs B and B needs A → A has 2 dependents.) Prerequisites from other subjects are ignored. */
export function countDependents(topics: PriorityInput[]): Map<string, number> {
  const ids = new Set(topics.map((topic) => topic.id))
  const neededBy = new Map<string, string[]>()
  for (const topic of topics) {
    for (const prerequisite of topic.prerequisiteIds) {
      if (!ids.has(prerequisite) || prerequisite === topic.id) continue
      neededBy.set(prerequisite, [...(neededBy.get(prerequisite) ?? []), topic.id])
    }
  }

  const result = new Map<string, number>()
  for (const topic of topics) {
    const found = new Set<string>()
    const toVisit = [...(neededBy.get(topic.id) ?? [])]
    for (let next = toVisit.pop(); next !== undefined; next = toVisit.pop()) {
      // `found` stops circular prerequisites (A needs B, B needs A) from looping forever.
      if (next === topic.id || found.has(next)) continue
      found.add(next)
      toVisit.push(...(neededBy.get(next) ?? []))
    }
    result.set(topic.id, found.size)
  }
  return result
}

/** The priority of every topic in ONE subject. */
export function priorityScores(topics: PriorityInput[]): Map<string, PriorityResult> {
  const dependents = countDependents(topics)
  const maxExamWeight = Math.max(0, ...topics.map((topic) => topic.examWeight))
  const maxPyqCount = Math.max(0, ...topics.map((topic) => topic.pyqCount))
  const maxPyqShare = Math.max(0, ...topics.map((topic) => topic.pyqMarksShare))
  const maxDependents = Math.max(0, ...dependents.values())

  const result = new Map<string, PriorityResult>()
  for (const topic of topics) {
    const count = dependents.get(topic.id) ?? 0
    const examPart = scale(topic.examWeight, maxExamWeight)
    const pyqPart = 0.5 * scale(topic.pyqCount, maxPyqCount) + 0.5 * scale(topic.pyqMarksShare, maxPyqShare)
    const dependentsPart = scale(count, maxDependents)
    const score =
      PRIORITY_WEIGHTS.exam * examPart + PRIORITY_WEIGHTS.pyq * pyqPart + PRIORITY_WEIGHTS.dependents * dependentsPart
    result.set(topic.id, {
      score: round4(Math.min(1, score)),
      examPart: round4(examPart),
      pyqPart: round4(pyqPart),
      dependentsPart: round4(dependentsPart),
      dependents: count,
    })
  }
  return result
}
