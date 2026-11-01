import { format, parseISO } from 'date-fns'
import type { Hustle, PhaseStatus } from './hustles'

// How Hustle shows money, goals and statuses, in one place.

/** 6000 → "₹6,000", 150000 → "₹1,50,000" (Indian digit grouping, whole rupees). */
export function formatMoney(amount: number, currency = 'INR'): string {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    // An unknown currency code: the number with the code in front.
    return `${currency} ${Math.round(amount).toLocaleString('en-IN')}`
  }
}

/** The money goal: "₹10,000 by 31 Jan 2027", "₹10,000", "By 31 Jan 2027", or null. */
export function targetLabel(hustle: Pick<Hustle, 'goal_amount' | 'goal_date' | 'currency'>): string | null {
  const date = hustle.goal_date ? format(parseISO(hustle.goal_date), 'd MMM yyyy') : null
  if (hustle.goal_amount !== null) return `${formatMoney(Number(hustle.goal_amount), hustle.currency)}${date ? ` by ${date}` : ''}`
  return date ? `By ${date}` : null
}

export const PHASE_STATUS_LABEL: Record<PhaseStatus, string> = { todo: 'To do', doing: 'In progress', done: 'Done' }

export const HUSTLE_STATUS_LABEL: Record<string, string> = { active: 'Active', paused: 'Paused', archived: 'Archived' }
