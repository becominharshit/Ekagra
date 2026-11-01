import { addDays, format, startOfDay } from 'date-fns'
import type { Subject } from '@/features/academics/subjects'
import { draftKey, type CaptureField, type TaskDraft } from './drafts'
import type { TaskArea } from './taskRules'

// Demo Mode has no AI, so typed tasks are read on the device with simple rules:
// "DBMS assignment due Friday 5pm", "lab record by tomorrow", "pay fees 15/11 urgent (30 min)".
// One task per line. Anything guessed is marked "unsure", so the confirm sheet highlights it.

const WEEKDAY_PREFIXES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const MONTH_PREFIXES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MONTH = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?'

const ACADEMIC = /\b(assignment|homework|hw|quiz|exam|test|lab|viva|project|lecture|class|submission|submit|practical|tutorial|record|journal|seminar|presentation|report|essay|syllabus|revision|revise)\b/i
const HUSTLE = /\b(client|invoice|freelanc\w*|gig|upwork|fiverr|youtube|reel|thumbnail|portfolio|startup|pitch|customer|order)\b/i
const BIG_WORK = /\b(assignment|project|report|record|journal|essay)\b/i
const STUDY_WORK = /\b(quiz|exam|test|viva|presentation|revision|revise)\b/i

type Subjects = Pick<Subject, 'id' | 'name' | 'code'>[]

/** The tasks in typed text, one per line (or per ";"). */
export function parseTasks(text: string, { now, subjects }: { now: Date; subjects: Subjects }): TaskDraft[] {
  return text
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter((line) => /[a-z]{2}/i.test(line))
    .slice(0, 20)
    .map((line) => parseLine(line, now, subjects))
}

function parseLine(line: string, now: Date, subjects: Subjects): TaskDraft {
  let rest = ` ${line} `
  const unsure = new Set<CaptureField>()
  /** Finds a pattern and takes it out of the text that becomes the title. */
  const take = (pattern: RegExp): RegExpExecArray | null => {
    const match = pattern.exec(rest)
    if (match) rest = `${rest.slice(0, match.index)} ${rest.slice(match.index + match[0].length)}`
    return match
  }

  // Priority
  let priority = 2
  if (take(/\b(urgent|asap|important)\b|!{2,}/i)) priority = 1
  else if (take(/\b(someday|whenever|low priority)\b/i)) priority = 4

  // Work time: "(2h)", "1.5 hours", "45 min"
  let estMinutes: number | null = null
  const hours = take(/\(?\b(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b\)?/i)
  const minutes = hours ? null : take(/\(?\b(\d+)\s*(?:min|mins|minutes)\b\)?/i)
  if (hours) estMinutes = Math.round(Number(hours[1]) * 60)
  else if (minutes) estMinutes = Number(minutes[1])

  // Time of day
  let minute: number | null = null
  const twelveHour = take(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
  if (twelveHour) {
    minute = ((Number(twelveHour[1]) % 12) + (twelveHour[3]?.toLowerCase() === 'pm' ? 12 : 0)) * 60 + Number(twelveHour[2] ?? 0)
  } else {
    const twentyFour = take(/\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/)
    if (twentyFour) minute = Number(twentyFour[1]) * 60 + Number(twentyFour[2])
    else if (take(/\b(?:at\s+)?(?:noon|midday)\b/i)) minute = 12 * 60
    else if (take(/\bmidnight\b/i)) minute = 23 * 60 + 59
  }

  // Date
  const today = startOfDay(now)
  let date: Date | null = null
  let match: RegExpExecArray | null
  if (take(/\bday after tomorrow\b/i)) date = addDays(today, 2)
  else if (take(/\b(?:tomorrow|tmrw|tmr)\b/i)) date = addDays(today, 1)
  else if (take(/\btonight\b/i)) {
    date = today
    minute ??= 21 * 60
  } else if (take(/\btoday\b/i)) date = today
  else if ((match = take(/\bin\s+(\d{1,2})\s+days?\b/i))) date = addDays(today, Number(match[1]))
  else if (take(/\b(?:in a week|next week)\b/i)) {
    date = addDays(today, 7)
    unsure.add('dueAt')
  } else if ((match = take(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat)\b/i))) {
    const weekday = WEEKDAY_PREFIXES.indexOf((match[2] ?? '').slice(0, 3).toLowerCase())
    date = addDays(today, (weekday - today.getDay() + 7) % 7)
    if (match[1]) unsure.add('dueAt') // "next Friday" can mean this Friday or the one after
  } else if ((match = take(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}(?:\\s+(\\d{4}))?\\b`, 'i')))) {
    date = calendarDate(Number(match[1]), monthIndex(match[2]), match[3], today)
  } else if ((match = take(new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i')))) {
    date = calendarDate(Number(match[2]), monthIndex(match[1]), match[3], today)
  } else if ((match = take(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/))) {
    // Indian style: day/month
    date = calendarDate(Number(match[1]), Number(match[2]) - 1, match[3], today)
  }
  if (!date && minute !== null) {
    // Only a time: today if it's still ahead, otherwise tomorrow.
    date = minute > now.getHours() * 60 + now.getMinutes() ? today : addDays(today, 1)
    unsure.add('dueAt')
  }
  if (!date) unsure.add('dueAt')

  // Subject, area and work time
  const subject = subjects.find((candidate) => mentions(line, candidate.code) || mentions(line, candidate.name))
  let area: TaskArea = 'personal'
  if (subject || ACADEMIC.test(line)) area = 'academics'
  else if (HUSTLE.test(line)) area = 'hustle'
  else unsure.add('area')
  if (estMinutes === null) {
    estMinutes = BIG_WORK.test(line) ? 120 : STUDY_WORK.test(line) ? 90 : 30
    unsure.add('estMinutes')
  }

  // Title: what's left, without the little words that pointed at the date
  let title = rest
    .replace(/\bdue\b|\bdeadline\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  for (let previous = ''; previous !== title; ) {
    previous = title
    title = title.replace(/(?:^|\s)(?:by|on|at|before|for|till|until|from|,|-|:)$/i, '').trim()
  }
  title = title.replace(/^[\s,:-]+|[\s,:-]+$/g, '')
  if (!title) {
    title = line
    unsure.add('title')
  }

  return {
    key: draftKey(),
    title: title.charAt(0).toUpperCase() + title.slice(1),
    area,
    subjectId: subject?.id ?? null,
    dueDate: date ? format(date, 'yyyy-MM-dd') : '',
    dueTime: date && minute !== null && minute !== 23 * 60 + 59 ? `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}` : '',
    estMinutes,
    priority,
    unsure: [...unsure],
  }
}

function monthIndex(text: string | undefined): number {
  return MONTH_PREFIXES.indexOf((text ?? '').slice(0, 3).toLowerCase())
}

/** A day and month (and maybe a year). Without a year, a date long past means next year. */
function calendarDate(day: number, month: number, yearText: string | undefined, today: Date): Date | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null
  let year = yearText ? Number(yearText.length === 2 ? `20${yearText}` : yearText) : today.getFullYear()
  let date = new Date(year, month, day)
  if (date.getMonth() !== month) return null // e.g. 31/11
  if (!yearText && today.getTime() - date.getTime() > 60 * 24 * 3_600_000) {
    year += 1
    date = new Date(year, month, day)
  }
  return date
}

function mentions(line: string, word: string | null): boolean {
  if (!word || word.trim().length < 2) return false
  const escaped = word.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(line)
}
