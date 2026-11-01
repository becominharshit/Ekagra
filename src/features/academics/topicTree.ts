import type { TopicTree, TreeTopic } from '@shared/schemas.ts'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'

// A subject's roadmap: units, and topics inside them, on two tracks (exam and skill).
// This file holds the roadmap while the student edits it (a "draft"), and works out which rows
// to insert, change and delete when it is saved. Plain functions, tested on their own.

export type Topic = Tables<'topics'>
export type TopicPrereq = Tables<'topic_prereqs'>

/** Everything saved for one subject's roadmap. */
export interface Roadmap {
  topics: Topic[]
  prereqs: TopicPrereq[]
}

/** A topic in the editor. Saved topics use their database id as their key. */
export interface DraftTopic extends TreeTopic {
  /** Added by the student (saved with source 'manual'). */
  manual?: boolean
}
export interface DraftUnit {
  /** Set for units that are already saved. */
  id?: string
  title: string
  topics: DraftTopic[]
}
export interface DraftTree {
  units: DraftUnit[]
}

const byOrder = (a: Topic, b: Topic) => a.order_index - b.order_index
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)))
const round3 = (value: number) => Math.round(value * 1000) / 1000

/** Drops prerequisites that would make a circle (A needs B, B needs A): the later one goes. */
function withoutCircles(topics: DraftTopic[]): DraftTopic[] {
  const kept = new Map<string, string[]>()
  const needs = (from: string, target: string): boolean => {
    const seen = new Set<string>()
    const stack = [from]
    for (let key = stack.pop(); key !== undefined; key = stack.pop()) {
      if (key === target) return true
      if (seen.has(key)) continue
      seen.add(key)
      stack.push(...(kept.get(key) ?? []))
    }
    return false
  }
  return topics.map((topic) => {
    const prerequisites: string[] = []
    kept.set(topic.key, prerequisites)
    for (const key of topic.prerequisites) if (!needs(key, topic.key)) prerequisites.push(key)
    return { ...topic, prerequisites }
  })
}

/** Tidies a tree: trimmed titles, unique keys, only prerequisites that exist, and no circles. */
export function cleanDraft(tree: DraftTree): DraftTree {
  const keys = new Set<string>()
  const units = tree.units.map((unit) => ({
    ...unit,
    title: unit.title.trim(),
    topics: unit.topics.map((topic) => {
      let key = topic.key.trim() || 'topic'
      for (let n = 2; keys.has(key); n++) key = `${topic.key.trim() || 'topic'}-${n}`
      keys.add(key)
      return { ...topic, key, title: topic.title.trim() }
    }),
  }))
  const flat = withoutCircles(
    units.flatMap((unit) =>
      unit.topics.map((topic) => ({
        ...topic,
        prerequisites: [...new Set(topic.prerequisites)].filter((key) => key !== topic.key && keys.has(key)),
      })),
    ),
  )
  const cleaned = new Map(flat.map((topic) => [topic.key, topic]))
  return { units: units.map((unit) => ({ ...unit, topics: unit.topics.map((topic) => cleaned.get(topic.key) ?? topic) })) }
}

/** The AI's tree (or the Demo Mode sample) as an editor draft. */
export function fromAiTree(tree: TopicTree): DraftTree {
  return cleanDraft({ units: tree.units.map((unit) => ({ title: unit.title, topics: unit.topics })) })
}

/** A saved roadmap as an editor draft (keys are the topic ids). */
export function fromRoadmap(roadmap: Roadmap): DraftTree {
  const units = roadmap.topics.filter((topic) => topic.parent_id === null).sort(byOrder)
  return {
    units: units.map((unit) => ({
      id: unit.id,
      title: unit.title,
      topics: roadmap.topics
        .filter((topic) => topic.parent_id === unit.id)
        .sort(byOrder)
        .map((topic) => ({
          key: topic.id,
          title: topic.title,
          track: topic.track === 'skill' ? 'skill' : 'exam',
          estMinutes: topic.est_minutes ?? 60,
          difficulty: topic.difficulty ?? 3,
          examWeight: Number(topic.exam_weight),
          prerequisites: roadmap.prereqs.filter((link) => link.topic_id === topic.id).map((link) => link.prereq_topic_id),
          manual: topic.source === 'manual',
        })),
    })),
  }
}

// ---------------------------------------------------------------------------
// Editing (each returns a new draft)
// ---------------------------------------------------------------------------

export function updateTopic(tree: DraftTree, key: string, patch: Partial<Omit<DraftTopic, 'key'>>): DraftTree {
  return {
    units: tree.units.map((unit) => ({
      ...unit,
      topics: unit.topics.map((topic) => (topic.key === key ? { ...topic, ...patch } : topic)),
    })),
  }
}

/** Removes a topic, and removes it from other topics' prerequisites. */
export function removeTopic(tree: DraftTree, key: string): DraftTree {
  return {
    units: tree.units.map((unit) => ({
      ...unit,
      topics: unit.topics
        .filter((topic) => topic.key !== key)
        .map((topic) => ({ ...topic, prerequisites: topic.prerequisites.filter((prerequisite) => prerequisite !== key) })),
    })),
  }
}

export function removePrerequisite(tree: DraftTree, key: string, prerequisite: string): DraftTree {
  const topic = tree.units.flatMap((unit) => unit.topics).find((candidate) => candidate.key === key)
  if (!topic) return tree
  return updateTopic(tree, key, { prerequisites: topic.prerequisites.filter((existing) => existing !== prerequisite) })
}

let lastKey = 0
function newKey(): string {
  lastKey += 1
  return `new-${Date.now().toString(36)}-${lastKey}`
}

/** Adds a topic at the end of a unit, with middle-of-the-road estimates. */
export function addTopic(tree: DraftTree, unitIndex: number, title = 'New topic'): DraftTree {
  return {
    units: tree.units.map((unit, index) => {
      if (index !== unitIndex) return unit
      const track = unit.topics.length > 0 && unit.topics.every((topic) => topic.track === 'skill') ? 'skill' : 'exam'
      const topic: DraftTopic = {
        key: newKey(),
        title,
        track,
        estMinutes: 60,
        difficulty: 3,
        examWeight: track === 'skill' ? 0 : 0.5,
        prerequisites: [],
        manual: true,
      }
      return { ...unit, topics: [...unit.topics, topic] }
    }),
  }
}

export function addUnit(tree: DraftTree, title = `Unit ${tree.units.length + 1}`): DraftTree {
  return addTopic({ units: [...tree.units, { title, topics: [] }] }, tree.units.length)
}

export function renameUnit(tree: DraftTree, unitIndex: number, title: string): DraftTree {
  return { units: tree.units.map((unit, index) => (index === unitIndex ? { ...unit, title } : unit)) }
}

/** Removes a unit and its topics (and those topics from other topics' prerequisites). */
export function removeUnit(tree: DraftTree, unitIndex: number): DraftTree {
  const removed = new Set(tree.units[unitIndex]?.topics.map((topic) => topic.key) ?? [])
  return {
    units: tree.units
      .filter((_, index) => index !== unitIndex)
      .map((unit) => ({
        ...unit,
        topics: unit.topics.map((topic) => ({
          ...topic,
          prerequisites: topic.prerequisites.filter((key) => !removed.has(key)),
        })),
      })),
  }
}

/** What to fix before saving, in plain words. Empty = ready to save. */
export function draftProblems(tree: DraftTree): string[] {
  const problems: string[] = []
  const topics = tree.units.flatMap((unit) => unit.topics)
  if (topics.length === 0) problems.push('Add at least one topic.')
  if (tree.units.some((unit) => unit.topics.length > 0 && !unit.title.trim())) problems.push('Every unit needs a name.')
  if (topics.some((topic) => !topic.title.trim())) problems.push('Every topic needs a name.')
  if (topics.some((topic) => !(topic.estMinutes >= 5 && topic.estMinutes <= 600))) {
    problems.push('Minutes per topic must be between 5 and 600.')
  }
  return problems
}

export function draftSummary(tree: DraftTree): { topics: number; examMinutes: number; skillTopics: number } {
  const topics = tree.units.flatMap((unit) => unit.topics)
  return {
    topics: topics.length,
    examMinutes: topics.filter((topic) => topic.track === 'exam').reduce((sum, topic) => sum + topic.estMinutes, 0),
    skillTopics: topics.filter((topic) => topic.track === 'skill').length,
  }
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

export interface SavePlan {
  /** New units first, then new topics (a topic needs its unit to exist). */
  insert: TablesInsert<'topics'>[]
  update: { id: string; patch: TablesUpdate<'topics'> }[]
  /** Units and topics that are no longer in the draft. Do this last (it also deletes their topics). */
  remove: string[]
  insertPrereqs: TablesInsert<'topic_prereqs'>[]
  removePrereqs: string[]
}

type TopicValues = Pick<
  TablesInsert<'topics'>,
  'parent_id' | 'title' | 'order_index' | 'track' | 'est_minutes' | 'difficulty' | 'exam_weight'
>

/**
 * The rows to insert, change and delete so the saved roadmap matches the draft.
 * Saved topics keep their ids, so their past-paper links and progress stay.
 */
export function planSave(
  subjectId: string,
  existing: Roadmap,
  draft: DraftTree,
  newId: () => string = () => crypto.randomUUID(),
): SavePlan {
  const saved = new Map(existing.topics.map((topic) => [topic.id, topic]))
  const units = cleanDraft(draft).units.filter((unit) => unit.topics.length > 0)
  const idOf = new Map<string, string>()
  for (const topic of units.flatMap((unit) => unit.topics)) idOf.set(topic.key, saved.has(topic.key) ? topic.key : newId())

  const plan: SavePlan = { insert: [], update: [], remove: [], insertPrereqs: [], removePrereqs: [] }
  const newTopics: TablesInsert<'topics'>[] = []
  const kept = new Set<string>()

  const sync = (id: string, values: TopicValues, source: string, into: TablesInsert<'topics'>[]) => {
    kept.add(id)
    const current = saved.get(id)
    if (!current) {
      into.push({ id, subject_id: subjectId, source, ...values })
      return
    }
    const patch: TablesUpdate<'topics'> = {}
    for (const [column, value] of Object.entries(values) as [keyof TopicValues, TopicValues[keyof TopicValues]][]) {
      const before = current[column]
      const same = typeof value === 'number' ? Number(before) === value : before === value
      if (!same) Object.assign(patch, { [column]: value })
    }
    if (Object.keys(patch).length > 0) plan.update.push({ id, patch })
  }

  units.forEach((unit, unitIndex) => {
    const unitId = unit.id && saved.has(unit.id) ? unit.id : newId()
    const track = unit.topics.every((topic) => topic.track === 'skill') ? 'skill' : 'exam'
    sync(unitId, { parent_id: null, title: unit.title, order_index: unitIndex, track, est_minutes: null, difficulty: null, exam_weight: 0 }, 'syllabus', plan.insert)
    unit.topics.forEach((topic, topicIndex) => {
      sync(
        idOf.get(topic.key) ?? newId(),
        {
          parent_id: unitId,
          title: topic.title,
          order_index: topicIndex,
          track: topic.track,
          est_minutes: clamp(topic.estMinutes, 5, 600),
          difficulty: clamp(topic.difficulty, 1, 5),
          exam_weight: round3(Math.min(1, Math.max(0, topic.examWeight))),
        },
        topic.manual ? 'manual' : 'syllabus',
        newTopics,
      )
    })
  })
  plan.insert.push(...newTopics)
  plan.remove = existing.topics.filter((topic) => !kept.has(topic.id)).map((topic) => topic.id)

  const wanted = new Set<string>()
  for (const topic of units.flatMap((unit) => unit.topics)) {
    for (const key of topic.prerequisites) {
      const topicId = idOf.get(topic.key)
      const prereqId = idOf.get(key)
      if (topicId && prereqId) wanted.add(`${topicId}>${prereqId}`)
    }
  }
  const have = new Set(existing.prereqs.map((link) => `${link.topic_id}>${link.prereq_topic_id}`))
  for (const pair of wanted) {
    const [topicId = '', prereqId = ''] = pair.split('>')
    if (!have.has(pair)) plan.insertPrereqs.push({ topic_id: topicId, prereq_topic_id: prereqId })
  }
  plan.removePrereqs = existing.prereqs
    .filter((link) => kept.has(link.topic_id) && kept.has(link.prereq_topic_id))
    .filter((link) => !wanted.has(`${link.topic_id}>${link.prereq_topic_id}`))
    .map((link) => link.id)
  return plan
}

// ---------------------------------------------------------------------------
// Showing a saved roadmap
// ---------------------------------------------------------------------------

export interface RoadmapSection {
  title: string
  topics: Topic[]
}

/** The topics of one track, by unit in syllabus order, or all together by priority. */
export function roadmapSections(roadmap: Roadmap, track: 'exam' | 'skill', order: 'syllabus' | 'priority'): RoadmapSection[] {
  const leaves = roadmap.topics.filter((topic) => topic.parent_id !== null && topic.track === track)
  if (order === 'priority') {
    const sorted = [...leaves].sort((a, b) => Number(b.priority_score) - Number(a.priority_score) || byOrder(a, b))
    return sorted.length > 0 ? [{ title: 'Most important first', topics: sorted }] : []
  }
  return roadmap.topics
    .filter((topic) => topic.parent_id === null)
    .sort(byOrder)
    .map((unit) => ({ title: unit.title, topics: leaves.filter((topic) => topic.parent_id === unit.id).sort(byOrder) }))
    .filter((section) => section.topics.length > 0)
}

/** For each topic: the titles of the topics to learn first. */
export function prerequisiteTitles(roadmap: Roadmap): Map<string, string[]> {
  const titles = new Map(roadmap.topics.map((topic) => [topic.id, topic.title]))
  const result = new Map<string, string[]>()
  for (const link of roadmap.prereqs) {
    const title = titles.get(link.prereq_topic_id)
    if (title) result.set(link.topic_id, [...(result.get(link.topic_id) ?? []), title])
  }
  return result
}

export type PriorityLabel = 'High' | 'Medium' | 'Low'

/**
 * Priority in words, compared with the subject's other topics: the top third is High, the middle
 * third Medium, the rest Low. Topics with the same score get the same word.
 */
export function priorityLabels(topics: Pick<Topic, 'id' | 'priority_score'>[]): Map<string, PriorityLabel> {
  const scores = topics.map((topic) => Number(topic.priority_score)).sort((a, b) => b - a)
  const cut = (share: number) => scores[Math.max(0, Math.ceil(scores.length * share) - 1)] ?? 0
  const high = cut(1 / 3)
  const medium = cut(2 / 3)
  return new Map(
    topics.map((topic) => {
      const score = Number(topic.priority_score)
      const label: PriorityLabel = score > 0 && score >= high ? 'High' : score > 0 && score >= medium ? 'Medium' : 'Low'
      return [topic.id, label]
    }),
  )
}
