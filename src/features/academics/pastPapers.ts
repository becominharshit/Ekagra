import type { PaperAnswer } from '@shared/schemas.ts'
import { priorityScores } from '@/features/planner/priority'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'
import type { Roadmap, Topic } from './topicTree'

// Past papers: their questions are matched to topics, then each topic gets its past-paper numbers
// (how often it was asked, its share of the marks, the last year) and a new priority.
// Plain functions, tested on their own.

export type Question = Tables<'questions'>
export type QuestionType = 'mcq' | 'short' | 'numerical' | 'code' | 'long'

/** One question as the student checks it before saving. */
export interface QuestionDraft {
  text: string
  marks: number | null
  type: QuestionType
  /** null = matches no topic (it still counts for the paper). */
  topicId: string | null
}

const round3 = (value: number) => Math.round(value * 1000) / 1000

/** The subject's topics in syllabus order (units are left out). */
export function leafTopics(topics: Topic[]): Topic[] {
  const unitOrder = new Map(topics.filter((topic) => topic.parent_id === null).map((unit) => [unit.id, unit.order_index]))
  return topics
    .filter((topic) => topic.parent_id !== null)
    .sort((a, b) => (unitOrder.get(a.parent_id ?? '') ?? 0) - (unitOrder.get(b.parent_id ?? '') ?? 0) || a.order_index - b.order_index)
}

/** Short keys for the AI (t1, t2, …) instead of long ids: fewer tokens, fewer mistakes. */
export function topicKeys(topics: Topic[]): { list: { key: string; title: string }[]; idByKey: Map<string, string> } {
  const leaves = leafTopics(topics)
  const list = leaves.map((topic, index) => ({ key: `t${index + 1}`, title: topic.title }))
  return { list, idByKey: new Map(leaves.map((topic, index) => [`t${index + 1}`, topic.id])) }
}

export function draftsFromAnswer(answer: PaperAnswer, idByKey: Map<string, string>): QuestionDraft[] {
  return answer.questions.map((question) => ({
    text: question.text,
    marks: question.marks,
    type: question.type,
    topicId: question.topicKey ? (idByKey.get(question.topicKey) ?? null) : null,
  }))
}

export function questionRows(
  drafts: QuestionDraft[],
  paper: { subjectId: string; paperId: string; year: number | null; promptVersion: string | null },
): TablesInsert<'questions'>[] {
  return drafts.map((draft) => ({
    subject_id: paper.subjectId,
    topic_id: draft.topicId,
    past_paper_id: paper.paperId,
    source: 'pyq',
    type: draft.type,
    prompt: draft.text.trim(),
    marks: draft.marks,
    year: paper.year,
    prompt_version: paper.promptVersion,
  }))
}

export interface PyqStat {
  count: number
  /** 0–1: this topic's share of all marks of the matched questions. */
  marksShare: number
  lastYear: number | null
}

/**
 * How often each topic was asked, its share of the marks and the last year it was asked.
 * A question without marks counts as an average question.
 */
export function pyqStats(questions: Pick<Question, 'topic_id' | 'marks' | 'year'>[]): Map<string, PyqStat> {
  const matched = questions.filter((question) => question.topic_id !== null)
  const known = matched.map((question) => question.marks).filter((marks): marks is number => marks !== null && marks > 0)
  const average = known.length > 0 ? known.reduce((sum, marks) => sum + Number(marks), 0) / known.length : 1
  const weight = (question: { marks: number | null }) => (question.marks !== null && question.marks > 0 ? Number(question.marks) : average)
  const total = matched.reduce((sum, question) => sum + weight(question), 0)

  const stats = new Map<string, { count: number; weight: number; lastYear: number | null }>()
  for (const question of matched) {
    const topicId = question.topic_id ?? ''
    const current = stats.get(topicId) ?? { count: 0, weight: 0, lastYear: null }
    current.count += 1
    current.weight += weight(question)
    if (question.year !== null && (current.lastYear === null || question.year > current.lastYear)) current.lastYear = question.year
    stats.set(topicId, current)
  }
  return new Map(
    [...stats].map(([topicId, stat]) => [
      topicId,
      { count: stat.count, marksShare: total > 0 ? round3(stat.weight / total) : 0, lastYear: stat.lastYear },
    ]),
  )
}

/**
 * New past-paper numbers and priority for each topic of a subject, only where something changed.
 * priority = 0.45 × exam weight + 0.35 × past papers + 0.20 × how many topics need it (M2's formula).
 */
export function priorityChanges(roadmap: Roadmap, questions: Pick<Question, 'topic_id' | 'marks' | 'year'>[]): { id: string; patch: TablesUpdate<'topics'> }[] {
  const leaves = leafTopics(roadmap.topics)
  const stats = pyqStats(questions)
  const scores = priorityScores(
    leaves.map((topic) => ({
      id: topic.id,
      examWeight: Number(topic.exam_weight),
      pyqCount: stats.get(topic.id)?.count ?? 0,
      pyqMarksShare: stats.get(topic.id)?.marksShare ?? 0,
      prerequisiteIds: roadmap.prereqs.filter((link) => link.topic_id === topic.id).map((link) => link.prereq_topic_id),
    })),
  )

  const changes: { id: string; patch: TablesUpdate<'topics'> }[] = []
  for (const topic of leaves) {
    const stat = stats.get(topic.id)
    const next = {
      pyq_count: stat?.count ?? 0,
      pyq_marks_share: stat?.marksShare ?? 0,
      last_asked_year: stat?.lastYear ?? null,
      priority_score: scores.get(topic.id)?.score ?? 0,
    }
    const changed =
      next.pyq_count !== topic.pyq_count ||
      next.pyq_marks_share !== Number(topic.pyq_marks_share) ||
      next.last_asked_year !== topic.last_asked_year ||
      next.priority_score !== Number(topic.priority_score)
    if (changed) changes.push({ id: topic.id, patch: next })
  }
  return changes
}
