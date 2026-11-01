import { useMutation, useQueryClient } from '@tanstack/react-query'
import { loadStudy } from '@/features/academics/roadmap'
import { academicsKey, createSubject, updateSubject, type Subject } from '@/features/academics/subjects'
import type { Topic } from '@/features/academics/topicTree'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { hustlesKey, type HustleStep } from './hustles'

// The Skill Bridge: "Learn this" on a hustle step that needs a skill makes (or reuses) a skill
// course in Academics with a weekly time limit, and links the step to a skill-track topic in it.
// The planner then gives the course its weekly time (and no more).

/** Minutes the first topic of a new skill course is planned for. */
export const FIRST_TOPIC_MINUTES = 240

const LEARNED = new Set(['review', 'mastered'])

/** The skill course with this name (any capitals), if there is one. */
export function findSkillCourse<T extends Pick<Subject, 'kind' | 'name'>>(subjects: T[], name: string): T | undefined {
  const wanted = name.trim().toLowerCase()
  return subjects.find((subject) => subject.kind === 'skill_course' && subject.name.trim().toLowerCase() === wanted)
}

/** The skill topic to learn next in a subject: the first one not learned yet, in syllabus order. */
export function nextSkillTopic(topics: Pick<Topic, 'id' | 'subject_id' | 'parent_id' | 'track' | 'status' | 'order_index'>[], subjectId: string) {
  const units = new Map(topics.filter((topic) => topic.subject_id === subjectId && topic.parent_id === null).map((unit) => [unit.id, unit.order_index]))
  return topics
    .filter((topic) => topic.subject_id === subjectId && topic.parent_id !== null && topic.track === 'skill' && !LEARNED.has(topic.status))
    .sort((a, b) => (units.get(a.parent_id ?? '') ?? 0) - (units.get(b.parent_id ?? '') ?? 0) || a.order_index - b.order_index)[0]
}

export interface LearnSkill {
  step: HustleStep
  skillName: string
  /** The skill course's weekly time. */
  weeklyMinutes: number
  /** Link this skill-track topic instead of using a skill course. */
  topicId: string | null
}

async function addTopics(source: DataSource, rows: { id: string; subject_id: string; parent_id: string | null; title: string; est_minutes: number | null }[]): Promise<void> {
  const values = rows.map((row) => ({ ...row, track: 'skill', source: 'skill_bridge', order_index: 0, difficulty: row.parent_id ? 2 : null }))
  if (source.kind === 'demo') {
    demoDb.insert('topics', values)
    return
  }
  const { error } = await source.client.from('topics').insert(values)
  if (error) throw dbError(error)
}

/** "Learn this": the step's skill gets a skill course (or an existing topic), and the step links to it. */
export async function learnSkill(source: DataSource, { step, skillName, weeklyMinutes, topicId }: LearnSkill): Promise<{ subjectId: string; topicId: string }> {
  const name = skillName.trim()
  const study = await loadStudy(source)
  let link: { subjectId: string; topicId: string }

  const chosen = topicId ? study.topics.find((topic) => topic.id === topicId) : undefined
  if (topicId && !chosen) throw new Error('That topic was not found. It may have been deleted.')
  if (chosen) {
    link = { subjectId: chosen.subject_id, topicId: chosen.id }
  } else {
    // The skill course: reused when one with this name exists (its weekly time is updated).
    const existing = findSkillCourse(study.subjects, name)
    const course = existing ?? (await createSubject(source, { name, kind: 'skill_course', weekly_minutes_limit: weeklyMinutes }))
    if (existing && existing.weekly_minutes_limit !== weeklyMinutes) await updateSubject(source, existing.id, { weekly_minutes_limit: weeklyMinutes })
    const next = nextSkillTopic(study.topics, course.id)
    if (next) link = { subjectId: course.id, topicId: next.id }
    else {
      // A new course gets one unit with a first topic; more can be added in Academics.
      const unitId = crypto.randomUUID()
      const firstId = crypto.randomUUID()
      await addTopics(source, [
        { id: unitId, subject_id: course.id, parent_id: null, title: 'Basics', est_minutes: null },
        { id: firstId, subject_id: course.id, parent_id: unitId, title: `${name} basics`, est_minutes: FIRST_TOPIC_MINUTES },
      ])
      link = { subjectId: course.id, topicId: firstId }
    }
  }

  const patch = { skill_name: name || step.skill_name, skill_subject_id: link.subjectId, skill_topic_id: link.topicId }
  if (source.kind === 'demo') demoDb.update('hustle_steps', step.id, patch)
  else {
    const { error } = await source.client.from('hustle_steps').update(patch).eq('id', step.id)
    if (error) throw dbError(error)
  }
  return link
}

/** "Learn this". Afterwards Hustle and Academics reload; the plan follows (its fingerprint sees the new topic). */
export function useLearnSkill() {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: LearnSkill) => learnSkill(need(source), variables),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: hustlesKey(owner) }),
        queryClient.invalidateQueries({ queryKey: academicsKey(owner) }),
      ])
    },
  })
}
