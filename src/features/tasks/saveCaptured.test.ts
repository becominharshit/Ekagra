import { describe, expect, it } from 'vitest'
import { createHustle, loadHustlePlans } from '@/features/hustle/hustles'
import { planFromTemplate, TEMPLATES } from '@/features/hustle/templates'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { blankDraft, capturedToDraft } from './drafts'
import { saveCaptured } from './saveCaptured'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }

describe('saving captured hustle tasks and leads (Demo Mode)', () => {
  it('saves to-dos as tasks of the hustle, and leads as cards at the end of its first column', async () => {
    await createHustle(DEMO, {
      type: 'freelancing',
      name: 'Logo design',
      goal: null,
      goalAmount: null,
      goalDate: null,
      currency: 'INR',
      phases: planFromTemplate(TEMPLATES.freelancing, 'Logo design'),
      stages: TEMPLATES.freelancing.stages,
    })
    const hustle = (await loadHustlePlans(DEMO))[0]?.hustle
    if (!hustle) throw new Error('no hustle')
    demoDb.insert('hustle_items', [{ hustle_id: hustle.id, kind: 'order', title: 'Café logo', stage: 'Proposal', order_index: 3 }])

    const todo = { ...blankDraft(), title: 'Send the invoice', area: 'hustle' as const, hustleId: hustle.id, dueDate: '2026-11-06' }
    const lead = { ...blankDraft(), title: 'Bakery logo', area: 'hustle' as const, hustleId: hustle.id, asCard: true, dueDate: '2026-11-10', dueTime: '17:00' }
    const chores = { ...blankDraft(), title: 'Laundry', area: 'personal' as const, hustleId: hustle.id, asCard: true }
    await saveCaptured(DEMO, { drafts: [todo, lead, chores], hustles: [hustle], from: { source: 'text', ref: 'typed' } })

    expect(demoDb.list('tasks').map((task) => [task.title, task.area, task.hustle_id, task.source])).toEqual([
      ['Send the invoice', 'hustle', hustle.id, 'text'],
      ['Laundry', 'personal', null, 'text'], // not a hustle task: a to-do, without the hustle
    ])
    const card = demoDb.list('hustle_items').find((item) => item.title === 'Bakery logo')
    expect(card).toMatchObject({ kind: 'order', stage: 'Proposal', order_index: 4, due_at: new Date('2026-11-10T17:00:00').toISOString(), currency: 'INR' })
  })

  it("turns the AI's hustle key and lead into the draft's hustle and card choice", () => {
    const task = {
      title: 'Bakery wants a logo',
      area: 'personal' as const,
      subjectKey: 's1',
      hustleKey: 'h1',
      lead: true,
      dueAt: null,
      estMinutes: null,
      priority: 2,
      unsure: ['hustle' as const],
    }
    expect(capturedToDraft(task, new Map([['s1', 'dbms']]), new Map([['h1', 'logos']]))).toMatchObject({
      area: 'hustle',
      hustleId: 'logos',
      subjectId: null,
      asCard: true,
      unsure: ['hustle'],
    })
    expect(capturedToDraft({ ...task, hustleKey: null }, new Map([['s1', 'dbms']]))).toMatchObject({ area: 'academics', hustleId: null, asCard: false })
  })
})
