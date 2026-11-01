import { describe, expect, it, vi } from 'vitest'
import { AiRequestError, callAiFunction } from '@/features/ai/aiClient'
import type { DataSource } from '@/lib/dataSource'
import { makeCustomPlan } from './customPlan'
import { TEMPLATES } from './templates'

vi.mock('@/features/ai/aiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/ai/aiClient')>()),
  callAiFunction: vi.fn(),
}))

const SIGNED_IN = { kind: 'supabase', userId: 'u', client: {} } as unknown as DataSource
const IDEA = { description: 'Handmade resin keychains for students', skill: 'Product photography', goal: '' }
const ANSWER = {
  name: 'Resin keychains',
  phases: [
    { title: 'Product', steps: [{ title: 'Make 5 test keychains', skill: null }] },
    { title: 'Photos', steps: [{ title: 'Learn product photos', skill: 'Product photography' }] },
    { title: 'Sell', steps: [{ title: 'Sell 10 at college', skill: null }] },
  ],
  stages: ['Order', 'Making', 'Paid'],
  model: 'smart',
  promptVersion: 'hustle-v1',
}

describe('makeCustomPlan', () => {
  it('uses the AI when signed in, and sends the idea without empty fields', async () => {
    vi.mocked(callAiFunction).mockResolvedValueOnce(ANSWER)
    const plan = await makeCustomPlan(SIGNED_IN, IDEA)
    expect(plan).toEqual({
      name: 'Resin keychains',
      phases: [
        { title: 'Product', steps: [{ title: 'Make 5 test keychains', skillName: null }] },
        { title: 'Photos', steps: [{ title: 'Learn product photos', skillName: 'Product photography' }] },
        { title: 'Sell', steps: [{ title: 'Sell 10 at college', skillName: null }] },
      ],
      stages: ['Order', 'Making', 'Paid'],
      by: 'ai',
      aiError: null,
    })
    expect(vi.mocked(callAiFunction).mock.calls[0]?.slice(0, 2)).toEqual([
      'ai-hustle',
      { description: 'Handmade resin keychains for students', skill: 'Product photography', goal: undefined },
    ])
  })

  it("uses the Custom template in Demo Mode, and when the AI isn't available (saying why)", async () => {
    const demo = await makeCustomPlan({ kind: 'demo' }, IDEA)
    expect(demo).toMatchObject({ name: null, stages: TEMPLATES.custom.stages, by: 'template', aiError: null })
    expect(demo.phases.flatMap((phase) => phase.steps).find((step) => step.skillName)).toEqual({ title: 'Learn Product photography', skillName: 'Product photography' })

    vi.mocked(callAiFunction).mockRejectedValueOnce(new AiRequestError('quota_exceeded', "You've used today's AI limit."))
    expect(await makeCustomPlan(SIGNED_IN, IDEA)).toMatchObject({ by: 'template', aiError: "You've used today's AI limit." })
  })
})
