import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { createHustle, loadHustlePlans } from './hustles'
import { findSkillCourse, FIRST_TOPIC_MINUTES, learnSkill, nextSkillTopic } from './skillBridge'
import { planFromTemplate, TEMPLATES } from './templates'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }

async function contentHustle() {
  await createHustle(DEMO, {
    type: 'content',
    name: 'Study vlogs',
    goal: null,
    goalAmount: null,
    goalDate: null,
    currency: 'INR',
    phases: planFromTemplate(TEMPLATES.content),
    stages: TEMPLATES.content.stages,
  })
  const steps = (await loadHustlePlans(DEMO))[0]?.phases.flatMap((phase) => phase.steps) ?? []
  const editing = steps.find((step) => step.skill_name === 'Video editing')
  const thumbnails = steps.find((step) => step.skill_name === 'Thumbnail design')
  if (!editing || !thumbnails) throw new Error('the content template has skill steps')
  return { editing, thumbnails }
}

describe('the Skill Bridge (Demo Mode)', () => {
  it('makes a skill course with a weekly limit and a first skill-track topic, and links the step', async () => {
    const { editing } = await contentHustle()
    const link = await learnSkill(DEMO, { step: editing, skillName: 'Video editing', weeklyMinutes: 180, topicId: null })

    const course = demoDb.get('subjects', link.subjectId)
    expect(course).toMatchObject({ name: 'Video editing', kind: 'skill_course', weekly_minutes_limit: 180, exam_date: null })
    const topics = demoDb.list('topics').filter((topic) => topic.subject_id === link.subjectId)
    expect(topics.map((topic) => [topic.title, topic.parent_id === null, topic.track, topic.source, topic.est_minutes])).toEqual([
      ['Basics', true, 'skill', 'skill_bridge', null],
      ['Video editing basics', false, 'skill', 'skill_bridge', FIRST_TOPIC_MINUTES],
    ])
    expect(demoDb.get('hustle_steps', editing.id)).toMatchObject({ skill_subject_id: link.subjectId, skill_topic_id: link.topicId })
  })

  it('reuses a skill course with the same name (and its next topic), with the new weekly time', async () => {
    const { editing } = await contentHustle()
    const first = await learnSkill(DEMO, { step: editing, skillName: 'Video editing', weeklyMinutes: 120, topicId: null })
    const again = await learnSkill(DEMO, { step: { ...editing, id: editing.id }, skillName: ' video EDITING ', weeklyMinutes: 60, topicId: null })
    expect(again).toEqual(first)
    expect(demoDb.list('subjects')).toHaveLength(1)
    expect(demoDb.get('subjects', first.subjectId)?.weekly_minutes_limit).toBe(60)

    // Once that topic is learned, the next "Learn this" makes no duplicate course: it links the next open topic (none → a new one).
    demoDb.update('topics', first.topicId, { status: 'mastered' })
    expect(nextSkillTopic(demoDb.list('topics'), first.subjectId)).toBeUndefined()
  })

  it('can link an existing skill-track topic instead', async () => {
    const { thumbnails } = await contentHustle()
    const [design] = demoDb.insert('subjects', [{ name: 'Graphic design' }])
    const [unit] = demoDb.insert('topics', [{ subject_id: design?.id ?? '', title: 'Unit 1' }])
    const [canva] = demoDb.insert('topics', [{ subject_id: design?.id ?? '', parent_id: unit?.id ?? null, title: 'Canva basics', track: 'skill' }])
    const link = await learnSkill(DEMO, { step: thumbnails, skillName: 'Thumbnail design', weeklyMinutes: 120, topicId: canva?.id ?? null })
    expect(link).toEqual({ subjectId: design?.id, topicId: canva?.id })
    expect(demoDb.list('subjects')).toHaveLength(1) // no skill course made
    await expect(learnSkill(DEMO, { step: thumbnails, skillName: 'x', weeklyMinutes: 60, topicId: 'gone' })).rejects.toThrow(/not found/)
  })

  it('finds skill courses by name only among skill courses', () => {
    const subjects = [
      { kind: 'course', name: 'React' },
      { kind: 'skill_course', name: 'React ' },
    ]
    expect(findSkillCourse(subjects, 'react')).toBe(subjects[1])
    expect(findSkillCourse(subjects, 'Vue')).toBeUndefined()
  })
})
