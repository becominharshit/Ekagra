import { describe, expect, it } from 'vitest'
import { formatMoney, targetLabel } from './labels'
import { HUSTLE_TYPES, planFromTemplate, TEMPLATES, toHustleType } from './templates'

describe('hustle templates', () => {
  it('has all 5 types from the spec, each with phases, steps, a board and platforms', () => {
    expect(HUSTLE_TYPES).toEqual(['freelancing', 'content', 'startup', 'parttime', 'custom'])
    for (const type of HUSTLE_TYPES) {
      const template = TEMPLATES[type]
      expect(template.type).toBe(type)
      expect(template.phases.length).toBeGreaterThanOrEqual(6)
      expect(template.phases.every((phase) => phase.steps.length > 0)).toBe(true)
      expect(template.stages.length).toBeGreaterThanOrEqual(3)
      expect(new Set(template.stages).size).toBe(template.stages.length)
      expect(template.platforms.every((platform) => platform.url.startsWith('https://'))).toBe(true)
    }
  })

  it("follows the spec's phases and boards", () => {
    const titles = (type: keyof typeof TEMPLATES) => TEMPLATES[type].phases.map((phase) => phase.title)
    expect(titles('freelancing')).toHaveLength(8)
    expect(titles('freelancing')[0]).toBe('Choose skill and niche')
    expect(titles('freelancing').at(-1)).toBe('Raise rates and repeat clients')
    expect(titles('content')).toEqual(['Niche and audience', 'Content pillars', 'Content calendar', 'Script', 'Record', 'Edit', 'Publish', 'Analyze and improve'])
    expect(titles('startup')).toHaveLength(8)
    expect(titles('parttime')).toEqual(['Define the offer', 'Pricing', 'Find students or clients', 'Schedule sessions', 'Deliver', 'Collect payment and feedback'])

    expect(Object.fromEntries(HUSTLE_TYPES.map((type) => [type, TEMPLATES[type].itemKind]))).toEqual({
      freelancing: 'order',
      content: 'content',
      startup: 'experiment',
      parttime: 'session',
      custom: 'other',
    })
    expect(TEMPLATES.freelancing.stages).toEqual(['Proposal', 'Active', 'Delivered', 'Paid'])
    expect(TEMPLATES.content.stages).toEqual(['Idea', 'Script', 'Record', 'Edit', 'Published'])
  })

  it('fills in the skill the student named, and marks the steps that need a skill', () => {
    const steps = (skill?: string) => planFromTemplate(TEMPLATES.freelancing, skill).flatMap((phase) => phase.steps)
    expect(steps('Logo design').find((step) => step.skillName !== null)).toEqual({ title: 'Learn Logo design', skillName: 'Logo design' })
    expect(steps('  ').find((step) => step.title.startsWith('Learn'))).toEqual({ title: 'Learn your main skill', skillName: null })
    expect(steps('Logo design').filter((step) => step.skillName !== null)).toHaveLength(1)

    const content = planFromTemplate(TEMPLATES.content).flatMap((phase) => phase.steps)
    expect(content.filter((step) => step.skillName !== null).map((step) => step.skillName)).toEqual(['Scriptwriting', 'Video editing', 'Thumbnail design'])
  })

  it('reads unknown types as custom', () => {
    expect([toHustleType('parttime'), toHustleType('crypto')]).toEqual(['parttime', 'custom'])
  })
})

describe('hustle labels', () => {
  it('shows money the Indian way, and the money goal', () => {
    expect([formatMoney(6000), formatMoney(150_000), formatMoney(-500)]).toEqual(['₹6,000', '₹1,50,000', '-₹500'])
    expect(targetLabel({ goal_amount: 10_000, goal_date: '2027-01-31', currency: 'INR' })).toBe('₹10,000 by 31 Jan 2027')
    expect(targetLabel({ goal_amount: 10_000, goal_date: null, currency: 'INR' })).toBe('₹10,000')
    expect(targetLabel({ goal_amount: null, goal_date: '2027-01-31', currency: 'INR' })).toBe('By 31 Jan 2027')
    expect(targetLabel({ goal_amount: null, goal_date: null, currency: 'INR' })).toBeNull()
  })
})
