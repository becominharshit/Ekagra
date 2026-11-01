import { useMemo } from 'react'
import { useStudy } from '@/features/academics/roadmap'
import type { Subject } from '@/features/academics/subjects'
import type { Topic, TopicPrereq } from '@/features/academics/topicTree'
import type { PlannerSubject, PlannerTopic } from './types'

// The student's subjects and topics in the shape the planner needs.

/** Topics in these states are already learned; the planner leaves them out. */
const LEARNED = new Set(['review', 'mastered'])

export function toPlannerStudy(
  subjects: Subject[],
  topics: Topic[],
  prereqs: TopicPrereq[],
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
      remainingMinutes: topic.est_minutes ?? 60,
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

/** The planner's study input for whoever uses the app (Supabase or Demo Mode). */
export function useStudyData() {
  const study = useStudy()
  const data = useMemo(
    () => (study.data ? toPlannerStudy(study.data.subjects, study.data.topics, study.data.prereqs) : null),
    [study.data],
  )
  return { ...study, data }
}
