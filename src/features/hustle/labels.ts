import { format, parseISO } from 'date-fns'
import { formatCurrency } from '@/lib/currency'
import type { Hustle, PhaseStatus } from './hustles'
import type { ItemKind } from './templates'

// How Hustle shows money, goals and statuses, in one place.

/** Formats money using the currency's proper locale (e.g. ₹6,000 for INR, $1,500 for USD). */
export function formatMoney(amount: number, currency = 'INR'): string {
  return formatCurrency(amount, currency, undefined, { maximumFractionDigits: 0 })
}

/** The money goal: "₹10,000 by 31 Jan 2027", "₹10,000", "By 31 Jan 2027", or null. */
export function targetLabel(hustle: Pick<Hustle, 'goal_amount' | 'goal_date' | 'currency'>): string | null {
  const date = hustle.goal_date ? format(parseISO(hustle.goal_date), 'd MMM yyyy') : null
  if (hustle.goal_amount !== null) return `${formatMoney(Number(hustle.goal_amount), hustle.currency)}${date ? ` by ${date}` : ''}`
  return date ? `By ${date}` : null
}

export const PHASE_STATUS_LABEL: Record<PhaseStatus, string> = { todo: 'To do', doing: 'In progress', done: 'Done' }

export const HUSTLE_STATUS_LABEL: Record<string, string> = { active: 'Active', paused: 'Paused', archived: 'Archived' }

/** Words that fit each kind of pipeline card. */
export const CARD_WORDS: Record<ItemKind, { card: string; amount: string; date: string; example: string }> = {
  order: { card: 'order', amount: 'Price', date: 'Due', example: 'e.g. Logo for a café' },
  content: { card: 'post', amount: 'Earned', date: 'Publish on', example: 'e.g. 5 study apps I use every day' },
  experiment: { card: 'experiment', amount: 'Cost', date: 'Check by', example: 'e.g. Will students buy a weekend crash guide?' },
  session: { card: 'session', amount: 'Fee', date: 'Session on', example: 'e.g. Algebra with Riya' },
  other: { card: 'card', amount: 'Amount', date: 'Due', example: 'e.g. First batch' },
}

/** What a hustle's clients are called: tutors have students. */
export function clientWord(type: string): { one: string; title: string; many: string } {
  return type === 'parttime' ? { one: 'student', title: 'Student', many: 'Students' } : { one: 'client', title: 'Client', many: 'Clients' }
}

/** A link that's safe to open: only web links (never javascript: and the like). */
export function safeUrl(url: string | null): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null
}
