import { describe, expect, it } from 'vitest'
import { draftsFromAnswer, leafTopics, priorityChanges, pyqStats, questionRows, topicKeys } from './pastPapers'
import type { Roadmap, Topic } from './topicTree'

function topic(id: string, values: Partial<Topic> = {}): Topic {
  return {
    id,
    user_id: 'user-1',
    subject_id: 'dbms',
    parent_id: 'unit-1',
    title: id,
    order_index: 0,
    track: 'exam',
    source: 'syllabus',
    est_minutes: 60,
    difficulty: 3,
    exam_weight: 0.5,
    pyq_count: 0,
    pyq_marks_share: 0,
    last_asked_year: null,
    priority_score: 0,
    status: 'not_started',
    mastery: 0,
    target_date: null,
    learned_at: null,
    created_at: '',
    updated_at: '',
    ...values,
  }
}

const ROADMAP: Roadmap = {
  topics: [
    topic('unit-2', { parent_id: null, order_index: 1, title: 'Unit 2' }),
    topic('unit-1', { parent_id: null, order_index: 0, title: 'Unit 1' }),
    topic('normalization', { parent_id: 'unit-2', order_index: 0, title: 'Normalization' }),
    topic('er', { order_index: 0, title: 'ER model' }),
    topic('sql', { order_index: 1, title: 'SQL queries' }),
  ],
  prereqs: [],
}

const question = (topicId: string | null, marks: number | null, year: number | null = 2024) => ({ topic_id: topicId, marks, year })

describe('keys for the AI', () => {
  it('gives the topics (not the units) short keys in syllabus order', () => {
    expect(leafTopics(ROADMAP.topics).map((t) => t.id)).toEqual(['er', 'sql', 'normalization'])
    const { list, idByKey } = topicKeys(ROADMAP.topics)
    expect(list).toEqual([
      { key: 't1', title: 'ER model' },
      { key: 't2', title: 'SQL queries' },
      { key: 't3', title: 'Normalization' },
    ])
    expect(idByKey.get('t3')).toBe('normalization')
  })

  it("turns the AI's answer into question rows for the paper", () => {
    const { idByKey } = topicKeys(ROADMAP.topics)
    const drafts = draftsFromAnswer(
      {
        year: 2024,
        examType: null,
        promptVersion: 'papers-v1',
        questions: [
          { text: 'Normalize R to BCNF', marks: 10, type: 'long', topicKey: 't3' },
          { text: 'Explain triggers', marks: 5, type: 'short', topicKey: null },
        ],
      },
      idByKey,
    )
    expect(drafts.map((d) => d.topicId)).toEqual(['normalization', null])
    expect(questionRows(drafts, { subjectId: 'dbms', paperId: 'paper-1', year: 2024, promptVersion: 'papers-v1' })[0]).toEqual({
      subject_id: 'dbms',
      topic_id: 'normalization',
      past_paper_id: 'paper-1',
      source: 'pyq',
      type: 'long',
      prompt: 'Normalize R to BCNF',
      marks: 10,
      year: 2024,
      prompt_version: 'papers-v1',
    })
  })
})

describe('pyqStats', () => {
  it('counts questions per topic, shares the marks and finds the last year asked', () => {
    const stats = pyqStats([question('sql', 10, 2022), question('sql', 5, 2024), question('er', 5, 2023), question(null, 20)])
    expect(stats.get('sql')).toEqual({ count: 2, marksShare: 0.75, lastYear: 2024 })
    expect(stats.get('er')).toEqual({ count: 1, marksShare: 0.25, lastYear: 2023 })
  })

  it('counts a question without marks as an average one', () => {
    const stats = pyqStats([question('sql', 10), question('er', null)])
    expect(stats.get('er')?.marksShare).toBe(0.5)
  })
})

describe('priorityChanges', () => {
  it('raises the priority of topics asked in past papers, and only lists what changed', () => {
    const changes = priorityChanges(ROADMAP, [question('normalization', 10), question('normalization', 10), question('sql', 5)])
    const byId = new Map(changes.map((change) => [change.id, change.patch]))
    expect(byId.get('normalization')).toMatchObject({ pyq_count: 2, pyq_marks_share: 0.8, last_asked_year: 2024 })
    expect(Number(byId.get('normalization')?.priority_score)).toBeGreaterThan(Number(byId.get('sql')?.priority_score))
    expect(Number(byId.get('sql')?.priority_score)).toBeGreaterThan(Number(byId.get('er')?.priority_score))

    // Saving those values and running again finds nothing to change.
    const saved: Roadmap = {
      ...ROADMAP,
      topics: ROADMAP.topics.map((t) => ({ ...t, ...(byId.get(t.id) ?? {}) }) as Topic),
    }
    expect(priorityChanges(saved, [question('normalization', 10), question('normalization', 10), question('sql', 5)])).toEqual([])
  })
})
