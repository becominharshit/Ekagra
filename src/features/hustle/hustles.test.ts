import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import {
  addStep,
  createHustle,
  currentPhaseIndex,
  deleteHustle,
  deleteStep,
  loadHustlePlans,
  phasePatch,
  setStepDone,
  stepProgress,
  type HustlePlan,
} from './hustles'
import { planFromTemplate, TEMPLATES } from './templates'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const NOW = new Date('2026-11-02T10:00:00.000Z')

async function startFreelancing(): Promise<HustlePlan> {
  const id = await createHustle(DEMO, {
    type: 'freelancing',
    name: 'Logos for cafés',
    goal: 'First ₹10,000 by January',
    goalAmount: 10_000,
    goalDate: '2027-01-31',
    currency: 'INR',
    phases: planFromTemplate(TEMPLATES.freelancing, 'Logo design'),
    stages: TEMPLATES.freelancing.stages,
  })
  const plan = (await loadHustlePlans(DEMO)).find((entry) => entry.hustle.id === id)
  if (!plan) throw new Error('the hustle was not saved')
  return plan
}

const phaseOf = async (hustleId: string, index: number) => {
  const plan = (await loadHustlePlans(DEMO)).find((entry) => entry.hustle.id === hustleId)
  const phase = plan?.phases[index]
  if (!phase) throw new Error(`no phase ${index}`)
  return phase
}

describe('hustles (Demo Mode)', () => {
  it('starts a hustle from a template, with its goal, board columns, phases and steps in order', async () => {
    const { hustle, phases } = await startFreelancing()
    expect(hustle).toMatchObject({
      type: 'freelancing',
      name: 'Logos for cafés',
      goal: 'First ₹10,000 by January',
      goal_amount: 10_000,
      goal_date: '2027-01-31',
      currency: 'INR',
      status: 'active',
      pipeline_stages: ['Proposal', 'Active', 'Delivered', 'Paid'],
      links: [],
    })
    expect(phases.map((phase) => phase.title)).toEqual(TEMPLATES.freelancing.phases.map((phase) => phase.title))
    expect(phases[1]?.steps.map((step) => [step.title, step.skill_name, step.done])).toEqual([
      ['Learn Logo design', 'Logo design', false],
      ['Make one practice project', null, false],
    ])
    expect(phases.every((phase) => phase.status === 'todo')).toBe(true)
  })

  it("checking steps moves the phase from to do, to in progress, to done, and back", async () => {
    const { hustle } = await startFreelancing()
    let phase = await phaseOf(hustle.id, 0)
    const [first, second, third] = phase.steps
    if (!first || !second || !third) throw new Error('the first phase has 3 steps')

    await setStepDone(DEMO, { step: first, done: true, phase, now: NOW })
    phase = await phaseOf(hustle.id, 0)
    expect(phase).toMatchObject({ status: 'doing', started_at: NOW.toISOString(), completed_at: null })

    for (const step of [second, third]) await setStepDone(DEMO, { step, done: true, phase: await phaseOf(hustle.id, 0), now: NOW })
    phase = await phaseOf(hustle.id, 0)
    expect(phase).toMatchObject({ status: 'done', completed_at: NOW.toISOString() })
    expect(currentPhaseIndex((await loadHustlePlans(DEMO))[0]?.phases ?? [])).toBe(1)

    await setStepDone(DEMO, { step: third, done: false, phase, now: NOW })
    expect(await phaseOf(hustle.id, 0)).toMatchObject({ status: 'doing', started_at: NOW.toISOString(), completed_at: null })
    const allSteps = TEMPLATES.freelancing.phases.flatMap((entry) => entry.steps).length
    expect(stepProgress((await loadHustlePlans(DEMO))[0]?.phases ?? [])).toEqual({ done: 2, total: allSteps })
  })

  it('adds and removes steps; removing the last open step finishes the phase', async () => {
    const { hustle } = await startFreelancing()
    const reviews = await phaseOf(hustle.id, 6) // Reviews and testimonials: 2 steps
    await addStep(DEMO, { phase: reviews, title: '  Share the review on LinkedIn  ', now: NOW })
    let phase = await phaseOf(hustle.id, 6)
    expect(phase.steps.map((step) => [step.title, step.order_index])).toEqual([
      ['Ask the client for a review', 0],
      ['Add the testimonial to your portfolio', 1],
      ['Share the review on LinkedIn', 2],
    ])

    for (const step of phase.steps.slice(0, 2)) await setStepDone(DEMO, { step, done: true, phase: await phaseOf(hustle.id, 6), now: NOW })
    phase = await phaseOf(hustle.id, 6)
    const extra = phase.steps[2]
    if (!extra) throw new Error('no added step')
    expect(phase.status).toBe('doing')
    await deleteStep(DEMO, { step: extra, phase, now: NOW })
    expect(await phaseOf(hustle.id, 6)).toMatchObject({ status: 'done', completed_at: NOW.toISOString() })
  })

  it('deleting a hustle deletes its phases and steps', async () => {
    const { hustle } = await startFreelancing()
    await deleteHustle(DEMO, hustle.id)
    expect([demoDb.list('hustles'), demoDb.list('hustle_phases'), demoDb.list('hustle_steps')].map((rows) => rows.length)).toEqual([0, 0, 0])
  })
})

describe('phasePatch', () => {
  it('only changes what is needed, and keeps when the phase was first started', () => {
    const started = '2026-10-01T00:00:00.000Z'
    expect(phasePatch({ status: 'todo', started_at: null }, [{ done: false }], NOW)).toBeNull()
    expect(phasePatch({ status: 'doing', started_at: started }, [{ done: true }, { done: true }], NOW)).toEqual({
      status: 'done',
      started_at: started,
      completed_at: NOW.toISOString(),
    })
    expect(phasePatch({ status: 'doing', started_at: started }, [{ done: false }], NOW)).toEqual({ status: 'todo', started_at: started, completed_at: null })
    expect(phasePatch({ status: 'todo', started_at: null }, [], NOW)).toBeNull() // a phase without steps stays to do
  })
})
