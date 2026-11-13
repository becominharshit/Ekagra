import { useQuery } from '@tanstack/react-query'
import { minutesLabel } from '@/features/academics/labels'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { hustlesKey } from './hustles'
import { formatMoney } from './labels'
import { inMonth, monthKey, totals, type Totals, type Transaction } from './money'
import type { TimeEntry } from './time'

// Earnings per hour = net profit ÷ hours spent, for a hustle, a client or a month.
// The same numbers as the database's hustle_earnings view (earnings.parity.test.ts checks it), but
// worked out in the app so they also work per client and per month, and in Demo Mode.

export interface Earnings extends Totals {
  minutes: number
  /** Net profit per hour, rounded to paise; null before any time is logged. */
  perHour: number | null
}

type Money = Pick<Transaction, 'kind' | 'amount' | 'client_id' | 'occurred_on' | 'hustle_id'>
type Time = Pick<TimeEntry, 'minutes' | 'client_id' | 'started_at' | 'hustle_id'>

export function earnings(transactions: Pick<Transaction, 'kind' | 'amount'>[], entries: Pick<TimeEntry, 'minutes'>[]): Earnings {
  const sums = totals(transactions)
  const minutes = entries.reduce((sum, entry) => sum + entry.minutes, 0)
  return { ...sums, minutes, perHour: minutes > 0 ? Math.round((sums.net / (minutes / 60)) * 100) / 100 : null }
}

/** Earnings of each client: their money and the time spent on them. */
export function clientEarnings(transactions: Money[], entries: Time[]): Map<string, Earnings> {
  const ids = new Set([...transactions, ...entries].flatMap((row) => (row.client_id ? [row.client_id] : [])))
  return new Map(
    [...ids].map((id) => [
      id,
      earnings(
        transactions.filter((row) => row.client_id === id),
        entries.filter((row) => row.client_id === id),
      ),
    ]),
  )
}

/** Time entries of one month ('YYYY-MM'), by their local date in `timeZone` (or OS local time if omitted). */
export function entriesInMonth<T extends Pick<TimeEntry, 'started_at'>>(entries: T[], month: string, timeZone?: string): T[] {
  return entries.filter((entry) => monthKey(new Date(entry.started_at), timeZone) === month)
}

/** This month's earnings of one hustle. */
export function monthEarnings(transactions: Money[], entries: Time[], now: Date, timeZone?: string): Earnings {
  const month = monthKey(now, timeZone)
  return earnings(inMonth(transactions, month), entriesInMonth(entries, month, timeZone))
}

/** "₹6,000 in 40 h = ₹150/h", or "₹6,000, no time logged yet". */
export function perHourLabel(value: Earnings, currency: string): string {
  const net = formatMoney(value.net, currency)
  if (value.perHour === null) return `${net}, no time logged yet`
  return `${net} in ${minutesLabel(value.minutes)} = ${formatMoney(value.perHour, currency)}/h`
}

export interface AllMoney {
  transactions: Money[]
  entries: Time[]
}

/** All hustles' money and time (for the Hustle tab's cards). */
export async function loadAllMoney(source: DataSource): Promise<AllMoney> {
  if (source.kind === 'demo') return { transactions: demoDb.list('transactions'), entries: demoDb.list('time_entries') }
  const { client, userId } = source
  const [transactions, entries] = await Promise.all([
    client.from('transactions').select('kind, amount, client_id, occurred_on, hustle_id').eq('user_id', userId),
    client.from('time_entries').select('minutes, client_id, started_at, hustle_id').eq('user_id', userId),
  ])
  const error = transactions.error ?? entries.error
  if (error) throw dbError(error)
  return { transactions: transactions.data ?? [], entries: entries.data ?? [] }
}

export function useAllMoney() {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...hustlesKey(owner), 'all-money'],
    queryFn: () => loadAllMoney(need(source)),
    enabled: source !== null,
  })
}
