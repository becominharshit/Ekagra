import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Tables } from '@/types/database'
import { hustlesKey } from './hustles'

// A hustle's money: income and expenses (transactions), in Supabase or (Demo Mode) on the device,
// and the sums the Money tab shows. The sums are plain functions, tested.

export type Transaction = Tables<'transactions'>
export type MoneyKind = 'income' | 'expense'

export interface Totals {
  income: number
  expense: number
  /** Net profit: income minus expenses. */
  net: number
}

type Amount = Pick<Transaction, 'kind' | 'amount'>

export function totals(transactions: Amount[]): Totals {
  let income = 0
  let expense = 0
  for (const transaction of transactions) {
    if (transaction.kind === 'income') income += Number(transaction.amount)
    else expense += Number(transaction.amount)
  }
  // Rupees and paise: round away tiny floating-point leftovers.
  const round = (value: number) => Math.round(value * 100) / 100
  return { income: round(income), expense: round(expense), net: round(income - expense) }
}

/** 'YYYY-MM' of a date in local time, e.g. '2026-11'. */
export function monthKey(date: Date): string {
  return format(date, 'yyyy-MM')
}

/** The money of one month ('YYYY-MM'). */
export function inMonth<T extends Pick<Transaction, 'occurred_on'>>(transactions: T[], month: string): T[] {
  return transactions.filter((transaction) => transaction.occurred_on.startsWith(month))
}

/** How far the net profit is toward the money goal. Null when there's no goal. */
export function goalProgress(net: number, goalAmount: number | null): { percent: number; left: number } | null {
  if (goalAmount === null || goalAmount <= 0) return null
  return { percent: Math.max(0, Math.min(100, Math.round((net / goalAmount) * 100))), left: Math.max(0, goalAmount - net) }
}

/** Totals per client (money without a client is left out). */
export function clientTotals(transactions: (Amount & Pick<Transaction, 'client_id'>)[]): Map<string, Totals> {
  const groups = new Map<string, Amount[]>()
  for (const transaction of transactions) {
    if (!transaction.client_id) continue
    groups.set(transaction.client_id, [...(groups.get(transaction.client_id) ?? []), transaction])
  }
  return new Map([...groups].map(([clientId, group]) => [clientId, totals(group)]))
}

/** A card with a price that just moved into "Paid", without income logged for it yet: offer to log the payment. */
export function shouldOfferPayment(
  card: { id: string; amount: number | null },
  stage: string,
  transactions: Pick<Transaction, 'hustle_item_id' | 'kind'>[],
): boolean {
  return (
    stage.trim().toLowerCase() === 'paid' &&
    card.amount !== null &&
    Number(card.amount) > 0 &&
    !transactions.some((transaction) => transaction.hustle_item_id === card.id && transaction.kind === 'income')
  )
}

export interface TransactionFields {
  kind: MoneyKind
  amount: number
  /** 'YYYY-MM-DD' */
  occurredOn: string
  clientId: string | null
  itemId: string | null
  category: string | null
  note: string | null
}

const newestFirst = (a: Transaction, b: Transaction) => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at)

export async function listTransactions(source: DataSource, hustleId: string): Promise<Transaction[]> {
  if (source.kind === 'demo') return demoDb.list('transactions').filter((row) => row.hustle_id === hustleId).sort(newestFirst)
  const { data, error } = await source.client.from('transactions').select('*').eq('hustle_id', hustleId)
  if (error) throw dbError(error)
  return data.sort(newestFirst)
}

const values = (fields: TransactionFields) => ({
  kind: fields.kind,
  amount: fields.amount,
  occurred_on: fields.occurredOn,
  client_id: fields.clientId,
  hustle_item_id: fields.itemId,
  category: fields.category?.trim() || null,
  note: fields.note?.trim() || null,
})

/** Adds money to a hustle (no `id`) or changes it. */
export async function saveTransaction(
  source: DataSource,
  { hustleId, currency, id, fields }: { hustleId: string; currency: string; id: string | null; fields: TransactionFields },
): Promise<void> {
  const row = values(fields)
  if (source.kind === 'demo') {
    if (id) demoDb.update('transactions', id, row)
    else demoDb.insert('transactions', [{ ...row, hustle_id: hustleId, currency }])
    return
  }
  const { error } = id
    ? await source.client.from('transactions').update(row).eq('id', id)
    : await source.client.from('transactions').insert({ ...row, hustle_id: hustleId, currency })
  if (error) throw dbError(error)
}

export async function deleteTransaction(source: DataSource, id: string): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.remove('transactions', [id])
    return
  }
  const { error } = await source.client.from('transactions').delete().eq('id', id)
  if (error) throw dbError(error)
}

export function useTransactions(hustleId: string) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...hustlesKey(owner), 'money', hustleId],
    queryFn: () => listTransactions(need(source), hustleId),
    enabled: source !== null,
  })
}
