import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { deleteClient, listClients, saveClient } from './clients'
import { createHustle } from './hustles'
import {
  clientTotals,
  deleteTransaction,
  goalProgress,
  inMonth,
  listTransactions,
  monthKey,
  saveTransaction,
  shouldOfferPayment,
  totals,
  type TransactionFields,
} from './money'
import { planFromTemplate, TEMPLATES } from './templates'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const money = (kind: 'income' | 'expense', amount: number, occurredOn: string, extra: Partial<TransactionFields> = {}): TransactionFields => ({
  kind,
  amount,
  occurredOn,
  clientId: null,
  itemId: null,
  category: null,
  note: null,
  ...extra,
})

async function startFreelancing(): Promise<string> {
  return createHustle(DEMO, {
    type: 'freelancing',
    name: 'Logo design',
    goal: null,
    goalAmount: 10_000,
    goalDate: null,
    currency: 'INR',
    phases: planFromTemplate(TEMPLATES.freelancing, 'Logo design'),
    stages: TEMPLATES.freelancing.stages,
  })
}

describe('money sums', () => {
  const rows = [
    { kind: 'income', amount: 6000, occurred_on: '2026-11-03', client_id: 'cafe' },
    { kind: 'income', amount: 500.5, occurred_on: '2026-10-28', client_id: null },
    { kind: 'expense', amount: 799, occurred_on: '2026-11-05', client_id: null },
    { kind: 'income', amount: 1500, occurred_on: '2026-11-10', client_id: 'cafe' },
    { kind: 'expense', amount: 100.2, occurred_on: '2026-11-11', client_id: 'cafe' },
  ]

  it('adds up income, expenses and net profit, overall and for one month', () => {
    expect(totals(rows)).toEqual({ income: 8000.5, expense: 899.2, net: 7101.3 })
    expect(totals(inMonth(rows, '2026-11'))).toEqual({ income: 7500, expense: 899.2, net: 6600.8 })
    expect(monthKey(new Date('2026-11-30T23:00:00'))).toBe('2026-11')
  })

  it('shows progress toward the money goal (never below 0% or above 100%)', () => {
    expect(goalProgress(6000, 10_000)).toEqual({ percent: 60, left: 4000 })
    expect(goalProgress(-500, 10_000)).toEqual({ percent: 0, left: 10_500 })
    expect(goalProgress(12_000, 10_000)).toEqual({ percent: 100, left: 0 })
    expect(goalProgress(6000, null)).toBeNull()
  })

  it('adds up money per client', () => {
    expect(clientTotals(rows)).toEqual(new Map([['cafe', { income: 7500, expense: 100.2, net: 7399.8 }]]))
  })

  it('offers to log a payment when a card with a price moves into "Paid", only once', () => {
    const card = { id: 'logo', amount: 6000 }
    expect(shouldOfferPayment(card, 'Paid', [])).toBe(true)
    expect(shouldOfferPayment(card, ' paid ', [])).toBe(true)
    expect(shouldOfferPayment(card, 'Delivered', [])).toBe(false)
    expect(shouldOfferPayment({ id: 'logo', amount: null }, 'Paid', [])).toBe(false)
    expect(shouldOfferPayment(card, 'Paid', [{ hustle_item_id: 'logo', kind: 'income' }])).toBe(false)
    expect(shouldOfferPayment(card, 'Paid', [{ hustle_item_id: 'logo', kind: 'expense' }])).toBe(true)
  })
})

describe('clients and money (Demo Mode)', () => {
  it("saves a hustle's clients and money; deleting a client keeps the money", async () => {
    const hustleId = await startFreelancing()
    await saveClient(DEMO, { hustleId, id: null, fields: { name: ' Café Mocha ', platform: 'Instagram', contact: '', notes: null } })
    const [cafe] = await listClients(DEMO, hustleId)
    expect(cafe).toMatchObject({ name: 'Café Mocha', platform: 'Instagram', contact: null, hustle_id: hustleId })
    if (!cafe) throw new Error('no client')
    await saveClient(DEMO, { hustleId, id: cafe.id, fields: { name: 'Café Mocha', platform: 'Instagram', contact: '98xxxxxx10', notes: 'Pays on time' } })
    expect((await listClients(DEMO, hustleId))[0]).toMatchObject({ contact: '98xxxxxx10', notes: 'Pays on time' })

    await saveTransaction(DEMO, { hustleId, currency: 'INR', id: null, fields: money('income', 6000, '2026-11-03', { clientId: cafe.id, category: ' Logo ' }) })
    await saveTransaction(DEMO, { hustleId, currency: 'INR', id: null, fields: money('expense', 799, '2026-11-05', { category: 'Canva Pro' }) })
    const list = await listTransactions(DEMO, hustleId)
    expect(list.map((row) => [row.occurred_on, row.kind, row.amount, row.category, row.currency])).toEqual([
      ['2026-11-05', 'expense', 799, 'Canva Pro', 'INR'],
      ['2026-11-03', 'income', 6000, 'Logo', 'INR'],
    ])

    const expense = list[0]
    if (!expense) throw new Error('no expense')
    await saveTransaction(DEMO, { hustleId, currency: 'INR', id: expense.id, fields: money('expense', 899, '2026-11-05', { category: 'Canva Pro' }) })
    expect(totals(await listTransactions(DEMO, hustleId))).toEqual({ income: 6000, expense: 899, net: 5101 })

    await deleteClient(DEMO, cafe.id)
    expect((await listTransactions(DEMO, hustleId)).find((row) => row.kind === 'income')?.client_id).toBeNull()
    await deleteTransaction(DEMO, expense.id)
    expect(demoDb.list('transactions')).toHaveLength(1)
  })
})
