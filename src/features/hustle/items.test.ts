import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { stubLocalStorage } from '@/test/memoryStorage'
import { createHustle, loadHustlePlans } from './hustles'
import { addItem, applyMoves, boardColumns, deleteItem, itemNotes, listItems, moveItems, updateItem, type ItemFields } from './items'
import { moveInColumn, moveToColumn } from './ordering'
import { planFromTemplate, TEMPLATES } from './templates'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const fields = (title: string, extra: Partial<ItemFields> = {}): ItemFields => ({ title, amount: null, dueAt: null, url: null, notes: null, clientId: null, ...extra })

async function startTutoring() {
  await createHustle(DEMO, {
    type: 'parttime',
    name: 'Maths tuition',
    goal: null,
    goalAmount: null,
    goalDate: null,
    currency: 'INR',
    phases: planFromTemplate(TEMPLATES.parttime, 'Class 10 maths'),
    stages: TEMPLATES.parttime.stages,
  })
  const plan = (await loadHustlePlans(DEMO))[0]
  if (!plan) throw new Error('no hustle')
  return plan.hustle
}

describe('pipeline board cards (Demo Mode)', () => {
  it('adds cards at the end of a column, as the kind of card the hustle type uses', async () => {
    const hustle = await startTutoring()
    await addItem(DEMO, { hustle, stage: 'Requested', fields: fields('Algebra with Riya', { amount: 500, notes: ' Wants weekend slots ' }), after: null })
    await addItem(DEMO, { hustle, stage: 'Requested', fields: fields('Geometry with Arjun'), after: 1 })
    const items = await listItems(DEMO, hustle.id)
    expect(items.map((item) => [item.title, item.kind, item.stage, item.order_index, item.amount, item.currency])).toEqual([
      ['Algebra with Riya', 'session', 'Requested', 1, 500, 'INR'],
      ['Geometry with Arjun', 'session', 'Requested', 2, null, 'INR'],
    ])
    expect(itemNotes(items[0] ?? { data: {} })).toBe('Wants weekend slots')
  })

  it('moves a card up (only that card is saved) and to the next column', async () => {
    const hustle = await startTutoring()
    for (const [index, title] of ['A', 'B', 'C'].entries()) await addItem(DEMO, { hustle, stage: 'Requested', fields: fields(title), after: index === 0 ? null : index })
    let columns = boardColumns(hustle.pipeline_stages, await listItems(DEMO, hustle.id))
    const requested = columns.get('Requested') ?? []
    const c = requested.find((item) => item.title === 'C')
    if (!c) throw new Error('no card C')

    const up = moveInColumn(requested, c.id, -1)
    expect(up).toEqual([{ id: c.id, order_index: 1.5 }])
    await moveItems(DEMO, up)
    columns = boardColumns(hustle.pipeline_stages, await listItems(DEMO, hustle.id))
    expect(columns.get('Requested')?.map((item) => item.title)).toEqual(['A', 'C', 'B'])

    await moveItems(DEMO, moveToColumn(columns.get('Scheduled') ?? [], c, 'Scheduled'))
    columns = boardColumns(hustle.pipeline_stages, await listItems(DEMO, hustle.id))
    expect(columns.get('Requested')?.map((item) => item.title)).toEqual(['A', 'B'])
    expect(columns.get('Scheduled')?.map((item) => [item.title, item.order_index])).toEqual([['C', 1]])
  })

  it('edits a card without losing other data, and deletes it', async () => {
    const hustle = await startTutoring()
    await addItem(DEMO, { hustle, stage: 'Scheduled', fields: fields('Algebra'), after: null })
    const [item] = await listItems(DEMO, hustle.id)
    if (!item) throw new Error('no card')
    await updateItem(DEMO, { item: { ...item, data: { source: 'gmail', notes: null } }, fields: fields('Algebra (2 h)', { amount: 800, url: ' https://meet.google.com/abc ', notes: 'Bring past papers' }) })
    const [edited] = await listItems(DEMO, hustle.id)
    expect(edited).toMatchObject({ title: 'Algebra (2 h)', amount: 800, url: 'https://meet.google.com/abc', data: { source: 'gmail', notes: 'Bring past papers' } })

    await deleteItem(DEMO, item.id)
    expect(await listItems(DEMO, hustle.id)).toEqual([])
  })
})

describe('board columns', () => {
  const item = (title: string, stage: string, order_index: number) =>
    ({ id: title, title, stage, order_index }) as unknown as Parameters<typeof boardColumns>[1][number]

  it('sorts each column and puts cards of a column that no longer exists into the first one', () => {
    const columns = boardColumns(['To do', 'Done'], [item('b', 'To do', 2), item('a', 'To do', 1), item('old', 'Archive', 0.5), item('z', 'Done', 1)])
    expect([...columns].map(([stage, cards]) => [stage, cards.map((card) => card.title)])).toEqual([
      ['To do', ['old', 'a', 'b']],
      ['Done', ['z']],
    ])
  })

  it('shows moves that are still being saved', () => {
    const shown = applyMoves([item('a', 'To do', 1), item('b', 'To do', 2)], [{ id: 'b', order_index: 0.5, stage: 'Done' }])
    expect(shown.map((card) => [card.id, card.stage, card.order_index])).toEqual([
      ['a', 'To do', 1],
      ['b', 'Done', 0.5],
    ])
  })
})
