import type { Subject } from '@/features/academics/subjects'
import type { Topic, TopicPrereq } from '@/features/academics/topicTree'
import { remainingMinutes as minutesLeft } from './schedule'
import type { PlannerSubject, PlannerTopic } from './types'

// The student's subjects and topics in the shape the planner needs.

/** Topics in these states are already learned; the planner leaves them out. */
const LEARNED = new Set(['review', 'mastered'])

/** `done`: minutes already studied per topic (from finished plan blocks); they come off the estimate. */
export function toPlannerStudy(
  subjects: Subject[],
  topics: Topic[],
  prereqs: TopicPrereq[],
  done: ReadonlyMap<string, number> = new Map(),
): { subjects: PlannerSubject[]; topics: PlannerTopic[] } {
  const unitOrder = new Map(topics.filter((topic) => topic.parent_id === null).map((unit) => [unit.id, unit.order_index]))
  const open = topics.filter((topic) => topic.parent_id !== null && !LEARNED.has(topic.status))
  const openIds = new Set(open.map((topic) => topic.id))
  return {
    subjects: subjects.map((subject) => ({ id: subject.id, name: subject.name, examDate: subject.exam_date })),
    topics: open.map((topic) => ({
      id: topic.id,
      subjectId: topic.subject_id,
      title: topic.title,
      track: topic.track === 'skill' ? 'skill' : 'exam',
      remainingMinutes: minutesLeft(topic.est_minutes ?? 60, done.get(topic.id) ?? 0),
      difficulty: topic.difficulty ?? 3,
      priority: Number(topic.priority_score),
      // Prerequisites that are already learned don't hold anything back.
      prerequisiteIds: prereqs
        .filter((link) => link.topic_id === topic.id && openIds.has(link.prereq_topic_id))
        .map((link) => link.prereq_topic_id),
      orderIndex: (unitOrder.get(topic.parent_id ?? '') ?? 0) * 1000 + topic.order_index,
    })),
  }
}
