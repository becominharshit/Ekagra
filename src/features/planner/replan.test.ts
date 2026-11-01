import { describe, expect, it } from 'vitest'
import { addSampleSubjects } from '@/features/academics/sampleSubjects'
import { defaultRoutine, routineToRows } from '@/features/onboarding/routineDraft'
import { profileRepoFor } from '@/features/profile/queries'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { listBlocks, updateBlock } from './planBlocks'
import { replan } from './replan'

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
