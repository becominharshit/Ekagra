import { daysBetween } from '@/features/planner/time'
import type { LocalDate } from '@/features/planner/types'

// How Academics shows dates, minutes and difficulty, in one place.

/** "Exam in 30 days", "Exam tomorrow", "Exam was 3 days ago", or "No exam date". */
export function examLabel(examDate: LocalDate | null, today: LocalDate): string {
  if (!examDate) return 'No exam date'
  const days = daysBetween(today, examDate)
  if (days > 1) return `Exam in ${days} days`
  if (days === 1) return 'Exam tomorrow'
  if (days === 0) return 'Exam today'
  return `Exam was ${-days} day${days === -1 ? '' : 's'} ago`
}

/** 45 → "45 min", 150 → "2 h 30 min", 120 → "2 h". */
export function minutesLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  if (hours === 0) return `${rest} min`
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

/** 1 → "1 topic", 3 → "3 topics". */
export function countLabel(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export const DIFFICULTY_LABEL: Record<number, string> = {
  1: 'Very easy',
  2: 'Easy',
  3: 'Medium',
  4: 'Hard',
  5: 'Very hard',
}
