import { describe, expect, it } from 'vitest'
import type { Subject } from '@/features/academics/subjects'
import type { Topic, TopicPrereq } from '@/features/academics/topicTree'
import { toPlannerStudy } from './studyData'

const subject = { id: 'dbms', name: 'DBMS', exam_date: '2026-12-02' } as Subject

function topic(id: string, values: Partial<Topic>): Topic {
  return {
    id,
    subject_id: 'dbms',
    parent_id: 'unit-1',
    title: id,
    order_index: 0,
    track: 'exam',
    est_minutes: 90,
    difficulty: 2,
    priority_score: 0.5,
    status: 'not_started',
    ...values,
  } as Topic
}

const link = (topicId: string, prereqId: string) => ({ topic_id: topicId, prereq_topic_id: prereqId }) as TopicPrereq

describe('toPlannerStudy', () => {
  it('turns subjects and topics into planner input', () => {
    const topics = [
      topic('unit-1', { parent_id: null, order_index: 2 }),
      topic('er', { order_index: 0 }),
      topic('sql', { order_index: 1, est_minutes: null, difficulty: null, track: 'skill', priority_score: 0.9 }),
    ]
    const skillCourse = { id: 'video', name: 'Video editing', exam_date: null, kind: 'skill_course', weekly_minutes_limit: 180 } as Subject
    const noLimit = { ...skillCourse, id: 'canva', weekly_minutes_limit: null } as Subject
    const study = toPlannerStudy([subject, skillCourse, noLimit], topics, [link('sql', 'er')])
    expect(study.subjects).toEqual([
      { id: 'dbms', name: 'DBMS', examDate: '2026-12-02', weeklyMinutes: null },
      // Skill courses get their weekly time (2 h when none is set).
      { id: 'video', name: 'Video editing', examDate: null, weeklyMinutes: 180 },
      { id: 'canva', name: 'Video editing', examDate: null, weeklyMinutes: 120 },
    ])
    expect(study.topics).toEqual([
      { id: 'er', subjectId: 'dbms', title: 'er', track: 'exam', remainingMinutes: 90, difficulty: 2, priority: 0.5, prerequisiteIds: [], orderIndex: 2000 },
      { id: 'sql', subjectId: 'dbms', title: 'sql', track: 'skill', remainingMinutes: 60, difficulty: 3, priority: 0.9, prerequisiteIds: ['er'], orderIndex: 2001 },
    ])
  })

  it('leaves out learned topics, and prerequisites that are already learned', () => {
    const topics = [topic('er', { status: 'mastered' }), topic('sql', { status: 'learning' })]
    const study = toPlannerStudy([subject], topics, [link('sql', 'er')])
    expect(study.topics.map((t) => [t.id, t.prerequisiteIds])).toEqual([['sql', []]])
  })
})
