import { describe, expect, it } from 'vitest'
import type { TopicTree } from '@shared/schemas.ts'
import {
  addTopic,
  draftProblems,
  draftSummary,
  fromAiTree,
  fromRoadmap,
  planSave,
  prerequisiteTitles,
  priorityLabels,
  removeTopic,
  removeUnit,
  roadmapSections,
  updateTopic,
  type Roadmap,
  type Topic,
  type TopicPrereq,
} from './topicTree'

const SUBJECT = 'subject-1'

function topic(id: string, values: Partial<Topic> = {}): Topic {
  return {
    id,
    user_id: 'user-1',
    subject_id: SUBJECT,
    parent_id: null,
    title: id,
    order_index: 0,
    track: 'exam',
    source: 'syllabus',
    est_minutes: null,
    difficulty: null,
    exam_weight: 0,
    pyq_count: 0,
    pyq_marks_share: 0,
    last_asked_year: null,
    priority_score: 0,
    status: 'not_started',
    mastery: 0,
    target_date: null,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    ...values,
  }
}

function link(id: string, topicId: string, prereqId: string): TopicPrereq {
  return { id, user_id: 'user-1', topic_id: topicId, prereq_topic_id: prereqId, created_at: '', updated_at: '' }
}

const leaf = (id: string, parent: string, order: number, values: Partial<Topic> = {}) =>
  topic(id, { parent_id: parent, order_index: order, est_minutes: 60, difficulty: 3, exam_weight: 0.5, ...values })

/** DBMS: Unit 1 (ER model → SQL), Skill track (Window functions). */
const ROADMAP: Roadmap = {
  topics: [
    topic('unit-1', { title: 'Unit 1', order_index: 0 }),
    leaf('er', 'unit-1', 0, { title: 'ER model' }),
    leaf('sql', 'unit-1', 1, { title: 'SQL', priority_score: 0.9 }),
    topic('unit-skill', { title: 'Skill track', order_index: 1, track: 'skill' }),
    leaf('window', 'unit-skill', 0, { title: 'Window functions', track: 'skill', exam_weight: 0 }),
  ],
  prereqs: [link('link-1', 'sql', 'er')],
}

const AI_TREE: TopicTree = {
  units: [
    {
      title: '  Unit 1: Data models ',
      topics: [
        { key: 'a', title: ' ER model ', track: 'exam', estMinutes: 90, difficulty: 2, examWeight: 0.6, prerequisites: ['b'] },
        { key: 'b', title: 'Relational algebra', track: 'exam', estMinutes: 120, difficulty: 3, examWeight: 0.7, prerequisites: ['a', 'b', 'ghost'] },
        { key: 'a', title: 'SQL', track: 'exam', estMinutes: 150, difficulty: 2, examWeight: 0.9, prerequisites: ['b'] },
      ],
    },
  ],
}

const newIds = () => {
  let n = 0
  return () => `new-${++n}`
}

describe('fromAiTree', () => {
  it('trims titles, makes keys unique and keeps only prerequisites that exist, without circles', () => {
    const draft = fromAiTree(AI_TREE)
    const topics = draft.units[0]?.topics ?? []
    expect(draft.units[0]?.title).toBe('Unit 1: Data models')
    expect(topics.map((t) => [t.key, t.title])).toEqual([
      ['a', 'ER model'],
      ['b', 'Relational algebra'],
      ['a-2', 'SQL'],
    ])
    // a needs b, so b may not also need a (a circle); b can't need itself; "ghost" doesn't exist.
    expect(topics.map((t) => t.prerequisites)).toEqual([['b'], [], ['b']])
  })
})

describe('editing a draft', () => {
  it('removes a topic and also takes it out of other prerequisites', () => {
    const draft = removeTopic(fromAiTree(AI_TREE), 'b')
    expect(draft.units[0]?.topics.map((t) => [t.key, t.prerequisites])).toEqual([
      ['a', []],
      ['a-2', []],
    ])
  })

  it('adds a topic with middle-of-the-road estimates, marked as added by the student', () => {
    const draft = addTopic(fromAiTree(AI_TREE), 0, 'Indexing')
    expect(draft.units[0]?.topics.at(-1)).toMatchObject({ title: 'Indexing', estMinutes: 60, difficulty: 3, track: 'exam', manual: true })
  })

  it('removes a unit together with its topics', () => {
    const draft = fromRoadmap(ROADMAP)
    expect(removeUnit(draft, 1).units.map((unit) => unit.title)).toEqual(['Unit 1'])
  })

  it('lists what to fix before saving, and sums up the draft', () => {
    const draft = updateTopic(fromAiTree(AI_TREE), 'a', { title: ' ', estMinutes: 2 })
    expect(draftProblems(draft)).toEqual(['Every topic needs a name.', 'Minutes per topic must be between 5 and 600.'])
    expect(draftProblems({ units: [] })).toEqual(['Add at least one topic.'])
    expect(draftSummary(fromRoadmap(ROADMAP))).toEqual({ topics: 3, examMinutes: 120, skillTopics: 1 })
  })
})

describe('planSave', () => {
  it('inserts a new roadmap: units first, then topics, then the prerequisite links', () => {
    const plan = planSave(SUBJECT, { topics: [], prereqs: [] }, fromAiTree(AI_TREE), newIds())
    expect(plan.insert.map((row) => [row.id, row.parent_id, row.title])).toEqual([
      ['new-4', null, 'Unit 1: Data models'],
      ['new-1', 'new-4', 'ER model'],
      ['new-2', 'new-4', 'Relational algebra'],
      ['new-3', 'new-4', 'SQL'],
    ])
    expect(plan.insert[1]).toMatchObject({ subject_id: SUBJECT, source: 'syllabus', est_minutes: 90, difficulty: 2, exam_weight: 0.6, order_index: 0 })
    expect(plan.insertPrereqs).toEqual([
      { topic_id: 'new-1', prereq_topic_id: 'new-2' },
      { topic_id: 'new-3', prereq_topic_id: 'new-2' },
    ])
    expect(plan).toMatchObject({ update: [], remove: [], removePrereqs: [] })
  })

  it('changes nothing when a saved roadmap is saved again unchanged', () => {
    expect(planSave(SUBJECT, ROADMAP, fromRoadmap(ROADMAP), newIds())).toEqual({
      insert: [],
      update: [],
      remove: [],
      insertPrereqs: [],
      removePrereqs: [],
    })
  })

  it('keeps ids when editing: changes only what changed, removes what was removed', () => {
    let draft = fromRoadmap(ROADMAP)
    draft = updateTopic(draft, 'sql', { title: 'SQL queries', estMinutes: 150, prerequisites: [] })
    draft = removeTopic(draft, 'window')
    const plan = planSave(SUBJECT, ROADMAP, draft, newIds())

    expect(plan.update).toEqual([{ id: 'sql', patch: { title: 'SQL queries', est_minutes: 150 } }])
    expect(plan.remove).toEqual(['unit-skill', 'window']) // the skill unit is empty now
    expect(plan.removePrereqs).toEqual(['link-1'])
    expect(plan.insert).toEqual([])
  })

  it('moving a topic to a new unit creates the unit first, then moves the topic', () => {
    const draft = fromRoadmap(ROADMAP)
    const sql = draft.units[0]?.topics[1]
    if (!sql) throw new Error('missing SQL topic')
    const moved = { units: [...draft.units.map((u, i) => (i === 0 ? { ...u, topics: u.topics.slice(0, 1) } : u)), { title: 'Unit 2', topics: [sql] }] }
    const plan = planSave(SUBJECT, ROADMAP, moved, newIds())
    expect(plan.insert).toEqual([expect.objectContaining({ id: 'new-1', title: 'Unit 2', parent_id: null, order_index: 2 })])
    expect(plan.update).toContainEqual({ id: 'sql', patch: { parent_id: 'new-1', order_index: 0 } })
  })
})

describe('showing a roadmap', () => {
  it('groups each track by unit in syllabus order, or lists it by priority', () => {
    expect(roadmapSections(ROADMAP, 'exam', 'syllabus').map((s) => [s.title, s.topics.map((t) => t.id)])).toEqual([
      ['Unit 1', ['er', 'sql']],
    ])
    expect(roadmapSections(ROADMAP, 'skill', 'syllabus').map((s) => s.title)).toEqual(['Skill track'])
    expect(roadmapSections(ROADMAP, 'exam', 'priority')[0]?.topics.map((t) => t.id)).toEqual(['sql', 'er'])
  })

  it('names the topics to learn first', () => {
    expect(prerequisiteTitles(ROADMAP).get('sql')).toEqual(['ER model'])
  })

  it('puts priority into words compared with the other topics: top third High, middle Medium, rest Low', () => {
    const scored = [0.9, 0.8, 0.7, 0.6, 0.5].map((score, i) => ({ id: `t${i}`, priority_score: score }))
    expect([...priorityLabels(scored).values()]).toEqual(['High', 'High', 'Medium', 'Medium', 'Low'])
    // Equal scores get the same word; topics without a score are Low.
    expect([...priorityLabels([{ id: 'a', priority_score: 0.8 }, { id: 'b', priority_score: 0.8 }]).values()]).toEqual(['High', 'High'])
    expect(priorityLabels([{ id: 'a', priority_score: 0 }]).get('a')).toBe('Low')
  })
})
