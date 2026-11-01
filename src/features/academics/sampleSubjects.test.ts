import { describe, expect, it } from 'vitest'
import { defaultRoutine, routineToRows, toPlannerRoutine } from '@/features/onboarding/routineDraft'
import { buildPlan, minutesByArea } from '@/features/planner/planner'
import { toPlannerStudy } from '@/features/planner/studyData'
import type { DataSource } from '@/lib/dataSource'
import { stubLocalStorage } from '@/test/memoryStorage'
import { loadPapers } from './papers'
import { loadRoadmap, loadStudy } from './roadmap'
import { addSampleSubjects } from './sampleSubjects'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const MONDAY = '2026-11-02'

async function sampleStudy() {
  await addSampleSubjects(DEMO, MONDAY)
  return loadStudy(DEMO)
}

describe('sample subjects (Demo Mode)', () => {
  it('adds DBMS and Python, with exam dates counted from today', async () => {
    const study = await sampleStudy()
    expect(study.subjects.map((subject) => [subject.code, subject.exam_date])).toEqual([
      ['DBMS', '2026-12-02'],
      ['PY101', '2026-12-17'],
    ])
  })

  it('saves each roadmap with its prerequisites and a past paper that raises the asked topics', async () => {
    const study = await sampleStudy()
    const dbms = study.subjects[0]
    if (!dbms) throw new Error('DBMS is missing')
    const roadmap = await loadRoadmap(DEMO, dbms.id)
    const byTitle = new Map(roadmap.topics.map((topic) => [topic.title, topic]))

    expect(roadmap.prereqs).toHaveLength(5)
    expect(byTitle.get('SQL queries')).toMatchObject({ pyq_count: 2, track: 'exam', last_asked_year: 2024 })
    expect(byTitle.get('Modern SQL: window functions')).toMatchObject({ track: 'skill', pyq_count: 0 })
    expect(Number(byTitle.get('SQL queries')?.priority_score)).toBeGreaterThan(Number(byTitle.get('ER model')?.priority_score))
    expect((await loadPapers(DEMO, dbms.id)).papers).toEqual([expect.objectContaining({ year: 2024, exam_type: 'End semester' })])
  })

  it('gives the planner a normal Monday of study, hustle and life, inside the routine and with nothing at risk', async () => {
    const study = await sampleStudy()
    const plan = buildPlan({
      today: MONDAY,
      nowMinute: 0,
      routine: toPlannerRoutine(routineToRows(defaultRoutine())),
      ...toPlannerStudy(study.subjects, study.topics, study.prereqs),
      tasks: [],
      checkIns: [],
    })
    const monday = plan.days[0]
    if (!monday) throw new Error('The plan has no days')
    const areas = minutesByArea(monday)
    expect(areas.academics).toBeGreaterThan(0)
    expect(areas.hustle).toBeGreaterThan(0)
    expect(areas.life).toBeGreaterThan(0)
    expect(plan.atRisk).toEqual([])
    for (const day of plan.days) {
      for (const block of day.blocks) {
        expect(day.free.some((gap) => block.start >= gap.start && block.end <= gap.end)).toBe(true)
      }
    }
  })
})
