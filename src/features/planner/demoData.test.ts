import { describe, expect, it } from 'vitest'
import { defaultRoutine, routineToRows, toPlannerRoutine } from '@/features/onboarding/routineDraft'
import { demoStudyData } from './demoData'
import { buildPlan, minutesByArea } from './planner'

const MONDAY = '2026-11-02'

function demoPlan() {
  const routine = toPlannerRoutine(routineToRows(defaultRoutine()))
  return buildPlan({ today: MONDAY, nowMinute: 0, routine, ...demoStudyData(MONDAY), checkIns: [] })
}

describe('demoStudyData', () => {
  it('counts the exam dates from today, so the demo never goes stale', () => {
    expect(demoStudyData(MONDAY).subjects.map((subject) => [subject.name, subject.examDate])).toEqual([
      ['DBMS', '2026-12-02'],
      ['Python Programming', '2026-12-17'],
    ])
  })

  it('gives every topic a priority from 0 to 1, and only prerequisites from its own subject', () => {
    const { topics } = demoStudyData(MONDAY)
    const subjectOf = new Map(topics.map((topic) => [topic.id, topic.subjectId]))
    for (const topic of topics) {
      expect(topic.priority).toBeGreaterThanOrEqual(0)
      expect(topic.priority).toBeLessThanOrEqual(1)
      for (const id of topic.prerequisiteIds) expect(subjectOf.get(id)).toBe(topic.subjectId)
    }
  })

  it('fills a normal Monday with study, hustle and life, with nothing at risk', () => {
    const plan = demoPlan()
    const monday = plan.days[0]
    if (!monday) throw new Error('The plan has no days')
    const areas = minutesByArea(monday)
    expect(areas.academics).toBeGreaterThan(0)
    expect(areas.hustle).toBeGreaterThan(0)
    expect(areas.life).toBeGreaterThan(0)
    expect(monday.blocks.some((block) => block.subjectId === 'dbms')).toBe(true)
    expect(plan.atRisk).toEqual([])
  })

  it('never plans over the routine', () => {
    for (const day of demoPlan().days) {
      for (const block of day.blocks) {
        expect(day.free.some((gap) => block.start >= gap.start && block.end <= gap.end)).toBe(true)
      }
    }
  })
})
