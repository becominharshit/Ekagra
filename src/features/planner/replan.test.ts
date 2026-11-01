import { describe, expect, it } from 'vitest'
import { addSampleSubjects } from '@/features/academics/sampleSubjects'
import { defaultRoutine, routineToRows } from '@/features/onboarding/routineDraft'
import { crashToday, saveCheckIn, saveEveningCheckIn, undoCrash } from '@/features/checkins/checkins'
import { createHustle } from '@/features/hustle/hustles'
import { learnSkill } from '@/features/hustle/skillBridge'
import { planFromTemplate, TEMPLATES } from '@/features/hustle/templates'
import { profileRepoFor } from '@/features/profile/queries'
import { addTasks } from '@/features/tasks/tasks'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { listBlocks, updateBlock } from './planBlocks'
import { replan } from './replan'
import { localToIso } from './schedule'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const MONDAY = '2026-11-02'
const at = (date: string, time: string) => new Date(`${date}T${time}:00`) // local time

async function setUp() {
  const repo = profileRepoFor(DEMO)
  await repo.saveProfile({ onboarded_at: '2026-11-01T00:00:00Z', chronotype: 'neutral' })
  await repo.replaceRoutine(routineToRows(defaultRoutine()))
  await addSampleSubjects(DEMO, MONDAY)
}

const planned = () => demoDb.list('plan_blocks').filter((block) => block.status === 'planned')
const total = (blocks: { planned_minutes: number }[]) => blocks.reduce((sum, block) => sum + block.planned_minutes, 0)
const isRealWork = (block: { kind: string }) => block.kind === 'learn' || block.kind === 'task'
const minutesFor = (topicTitle: string) => {
  const topic = demoDb.list('topics').find((row) => row.title === topicTitle)
  return planned()
    .filter((block) => block.topic_id === topic?.id)
    .reduce((total, block) => total + block.planned_minutes, 0)
}

describe('making and saving the plan (Demo Mode)', () => {
  it('saves 14 days of planned blocks from now on, as plan version 1', async () => {
    await setUp()
    const result = await replan(DEMO, { from: 'now', now: at(MONDAY, '08:00') })
    expect(result).toMatchObject({ plannedFrom: MONDAY, version: 1 })

    const blocks = demoDb.list('plan_blocks')
    expect(blocks.length).toBe(result.blockCount)
    expect(blocks.every((block) => block.status === 'planned' && block.plan_version === 1)).toBe(true)
    expect(new Set(blocks.map((block) => block.date)).size).toBe(14)
    expect(blocks.every((block) => Date.parse(block.start_at) >= at(MONDAY, '08:00').getTime())).toBe(true)
    expect(blocks.some((block) => block.date === MONDAY && block.kind === 'learn')).toBe(true)
  })

  it('re-plans after the block that is running and keeps it, without doubling anything', async () => {
    await setUp()
    await replan(DEMO, { from: 'now', now: at(MONDAY, '08:00') })
    const [first] = await listBlocks(DEMO, MONDAY, MONDAY)
    if (!first) throw new Error('no block today')
    await updateBlock(DEMO, { id: first.id, patch: { status: 'in_progress' } })

    const during = new Date(Date.parse(first.start_at) + 10 * 60_000)
    const result = await replan(DEMO, { from: 'now', now: during })
    expect(result.version).toBe(2)
    const today = await listBlocks(DEMO, MONDAY, MONDAY)
    expect(today.find((block) => block.id === first.id)?.status).toBe('in_progress')
    const later = today.filter((block) => block.id !== first.id)
    expect(later.every((block) => block.start_at >= first.end_at)).toBe(true)
    expect(demoDb.list('plan_blocks').every((block) => block.plan_version === 2 || block.id === first.id)).toBe(true)
  })

  it('plans work time for a task before its due date', async () => {
    await setUp()
    await addTasks(DEMO, [{ title: 'DBMS assignment', area: 'academics', due_at: localToIso('2026-11-05', 17 * 60), est_minutes: 120 }])
    await replan(DEMO, { from: 'now', now: at(MONDAY, '08:00') })
    const taskBlocks = demoDb.list('plan_blocks').filter((block) => block.kind === 'task')
    expect(taskBlocks.reduce((total, block) => total + block.planned_minutes, 0)).toBe(120)
    expect(taskBlocks.every((block) => block.title === 'DBMS assignment' && block.date <= '2026-11-05')).toBe(true)
  })

  it("names the general hustle time after the main hustle, and links hustle blocks to their hustle", async () => {
    await setUp()
    const hustleId = await createHustle(DEMO, {
      type: 'freelancing',
      name: 'Logo design',
      goal: null,
      goalAmount: null,
      goalDate: null,
      currency: 'INR',
      phases: planFromTemplate(TEMPLATES.freelancing, 'Logo design'),
      stages: TEMPLATES.freelancing.stages,
    })
    await addTasks(DEMO, [{ title: 'Send 5 proposals', area: 'hustle', hustle_id: hustleId, est_minutes: 30 }])
    await replan(DEMO, { from: 'now', now: at(MONDAY, '08:00') })
    const hustleBlocks = planned().filter((block) => block.area === 'hustle')
    expect(hustleBlocks.length).toBeGreaterThan(0)
    expect(hustleBlocks.every((block) => block.hustle_id === hustleId)).toBe(true)
    expect(hustleBlocks.some((block) => block.kind === 'hustle' && block.title === 'Logo design')).toBe(true)
    expect(hustleBlocks.some((block) => block.kind === 'task' && block.title === 'Send 5 proposals')).toBe(true)
  })

  it('plans a Skill Bridge course: exactly its weekly minutes in the first week', async () => {
    const repo = profileRepoFor(DEMO)
    await repo.saveProfile({ onboarded_at: '2026-11-01T00:00:00Z', chronotype: 'neutral' })
    await repo.replaceRoutine(routineToRows(defaultRoutine()))
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
    const step = demoDb.list('hustle_steps').find((row) => row.skill_name === 'Video editing')
    if (!step) throw new Error('no skill step')
    const { subjectId } = await learnSkill(DEMO, { step, skillName: 'Video editing', weeklyMinutes: 120, topicId: null })

    await replan(DEMO, { from: 'now', now: at(MONDAY, '06:00') })
    const skillBlocks = planned().filter((block) => block.subject_id === subjectId)
    expect(total(skillBlocks.filter((block) => block.date <= '2026-11-08'))).toBe(120)
    expect(total(skillBlocks.filter((block) => block.date >= '2026-11-09'))).toBe(120)
  })

  it('takes work already done off the estimate', async () => {
    await setUp()
    await replan(DEMO, { from: 'now', now: at(MONDAY, '08:00') })
    const before = minutesFor('ER model')
    const erBlock = planned().find((block) => block.title === 'ER model')
    if (!erBlock) throw new Error('ER model is not planned')
    await updateBlock(DEMO, { id: erBlock.id, patch: { status: 'done', actual_minutes: erBlock.planned_minutes } })

    await replan(DEMO, { from: 'now', now: new Date(Date.parse(erBlock.end_at) + 60_000) })
    expect(minutesFor('ER model')).toBeLessThan(before)
  })

  it("marks earlier days' unfinished blocks as missed, and planning from tomorrow leaves today alone", async () => {
    await setUp()
    await replan(DEMO, { from: 'now', now: at(MONDAY, '08:00') })
    const mondayIds = (await listBlocks(DEMO, MONDAY, MONDAY)).map((block) => block.id)

    // Tuesday morning: Monday's blocks were never marked.
    await replan(DEMO, { from: 'now', now: at('2026-11-03', '08:00') })
    const monday = await listBlocks(DEMO, MONDAY, MONDAY)
    expect(monday.map((block) => block.id)).toEqual(mondayIds)
    expect(monday.every((block) => block.status === 'missed')).toBe(true)

    // Tuesday evening check-in: plan from Wednesday; Tuesday's blocks stay as they are.
    const tuesdayIds = (await listBlocks(DEMO, '2026-11-03', '2026-11-03')).map((block) => block.id)
    const result = await replan(DEMO, { from: 'tomorrow', now: at('2026-11-03', '21:30') })
    expect(result.plannedFrom).toBe('2026-11-04')
    expect((await listBlocks(DEMO, '2026-11-03', '2026-11-03')).map((block) => block.id)).toEqual(tuesdayIds)
    expect((await listBlocks(DEMO, '2026-11-04', '2026-11-04')).every((block) => block.plan_version === result.version)).toBe(true)
  })
})

describe('the plan after a check-in (Demo Mode)', () => {
  it('"I Crashed" shrinks today to the top block (≤ 30 min) and reviews (≤ 15 min); the rest moves to the next days', async () => {
    await setUp()
    const replanAtEight = () => replan(DEMO, { from: 'now', now: at(MONDAY, '08:00') })
    await replanAtEight()
    const normal = planned()
    const onMonday = (blocks: typeof normal) => blocks.filter((block) => block.date === MONDAY)
    const realWorkLater = (blocks: typeof normal) => total(blocks.filter((block) => block.date > MONDAY && isRealWork(block)))
    expect(total(onMonday(normal).filter(isRealWork))).toBeGreaterThan(30)

    await crashToday(DEMO, at(MONDAY, '08:00'))
    await replanAtEight()
    const minimum = onMonday(planned())
    expect(total(minimum.filter(isRealWork))).toBeGreaterThan(0)
    expect(total(minimum.filter(isRealWork))).toBeLessThanOrEqual(30)
    expect(total(minimum.filter((block) => block.kind === 'review'))).toBeLessThanOrEqual(15)
    expect(minimum.every((block) => isRealWork(block) || block.kind === 'review')).toBe(true) // no general Hustle/Life time
    expect(realWorkLater(planned())).toBeGreaterThan(realWorkLater(normal))

    // Undo: today gets its normal plan back.
    await undoCrash(DEMO, MONDAY)
    await replanAtEight()
    expect(onMonday(planned()).map((block) => [block.title, block.start_at])).toEqual(onMonday(normal).map((block) => [block.title, block.start_at]))
  })

  it('the evening check-in ends the day: unmarked blocks are missed and their work is planned once, from tomorrow', async () => {
    await setUp()
    await addTasks(DEMO, [{ title: 'Essay', area: 'academics', due_at: localToIso('2026-11-05', 17 * 60), est_minutes: 120 }])
    await replan(DEMO, { from: 'now', now: at(MONDAY, '08:00') })
    const essay = () => planned().filter((block) => block.title === 'Essay')
    expect(total(essay())).toBe(120)

    // An early check-in where nothing was done: every block of today counts as missed.
    const today = await listBlocks(DEMO, MONDAY, MONDAY)
    await saveEveningCheckIn(DEMO, {
      date: MONDAY,
      energy: 3,
      mood: 3,
      topDistraction: null,
      outcomes: today.map((block) => ({ block, outcome: 'missed' as const })),
      session: null,
      now: at(MONDAY, '08:30'),
    })
    await replan(DEMO, { from: 'tomorrow', now: at(MONDAY, '08:30') })
    expect(total(essay())).toBe(120)
    expect(essay().every((block) => block.date > MONDAY)).toBe(true)
  })

  it('after 3 check-ins with energy ≤ 2, tomorrow is planned lighter (Burnout Guard)', async () => {
    await setUp()
    const tuesday = () => planned().filter((block) => block.date === '2026-11-03')
    const hustleAndLife = (blocks: ReturnType<typeof tuesday>) => total(blocks.filter((block) => block.area === 'hustle' || block.area === 'life'))
    await replan(DEMO, { from: 'tomorrow', now: at(MONDAY, '21:30') })
    const normal = tuesday()

    for (const date of ['2026-10-31', '2026-11-01', MONDAY]) {
      await saveCheckIn(DEMO, date, { energy: 2, mood: 2, checked_in_at: at(date, '21:30').toISOString() })
    }
    await replan(DEMO, { from: 'tomorrow', now: at(MONDAY, '21:30') })
    expect(total(tuesday())).toBeLessThan(total(normal))
    // Hustle and Life fill their share of the day, so they show the 30% cut directly.
    expect(hustleAndLife(tuesday())).toBeLessThanOrEqual(Math.ceil(hustleAndLife(normal) * 0.75))
  })
})
