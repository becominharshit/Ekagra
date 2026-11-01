import { endOfDay, format } from 'date-fns'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { BriefResponseSchema, type BriefRequest } from '@shared/schemas.ts'
import { countLabel, minutesLabel } from '@/features/academics/labels'
import { useSubjects, type Subject } from '@/features/academics/subjects'
import { callAiFunction } from '@/features/ai/aiClient'
import { guardOn, useCheckIns, type CheckIn } from '@/features/checkins/checkins'
import { todaysQueue, useFlashcards, useReviewsToday } from '@/features/flashcards/flashcards'
import { dueMistakes } from '@/features/mistakes/ladder'
import { useMistakes } from '@/features/mistakes/mistakes'
import { useBlocks } from '@/features/planner/planBlocks'
import { readPlanRun, usePlanFingerprint } from '@/features/planner/replan'
import { blockMode, localDateOf, planIsFresh, type PlanBlock } from '@/features/planner/schedule'
import { daysBetween, parseTime } from '@/features/planner/time'
import type { LocalDate } from '@/features/planner/types'
import { useProfile } from '@/features/profile/queries'
import { readSettings, toMentorTone, type MentorTone } from '@/features/profile/settings'
import { dueLabel, dueSoon, type Task } from '@/features/tasks/taskRules'
import { useTasks } from '@/features/tasks/tasks'
import { useNow } from '@/hooks/useNow'
import { need, useDataSource, type DataSource } from '@/lib/dataSource'

// The morning brief: 3 short lines about what matters today. Signed in, the AI writes it
// (ai-brief); in Demo Mode (or when the AI isn't available) it is made on the device with simple
// rules. Either way it is kept on the device for the rest of the day; Refresh makes a new one.

const BriefSchema = z.object({
  date: z.string(),
  lines: z.array(z.string()).length(3),
  /** Who wrote it: the AI, or this device. */
  by: z.enum(['ai', 'device']),
  /** Why the AI didn't write it (signed in), shown under the brief. */
  aiError: z.string().nullable(),
})
export type Brief = z.infer<typeof BriefSchema>

export interface BriefData {
  now: Date
  today: LocalDate
  blocks: PlanBlock[]
  tasks: Task[]
  subjects: Pick<Subject, 'id' | 'name' | 'code' | 'exam_date'>[]
  flashcardsDue: number
  mistakesDue: number
  checkIns: CheckIn[]
  tone: MentorTone
}

const DEADLINE_HOURS = 7 * 24
const EXAM_DAYS = 30
const clock = (iso: string) => format(new Date(iso), 'HH:mm')
const byStart = (a: PlanBlock, b: PlanBlock) => Date.parse(a.start_at) - Date.parse(b.start_at)

/** What the brief is about, in the shape ai-brief takes. */
export function briefInput({ now, today, blocks, tasks, subjects, flashcardsDue, mistakesDue, checkIns, tone }: BriefData): BriefRequest {
  const subjectName = (id: string | null) => {
    const subject = subjects.find((row) => row.id === id)
    return subject ? (subject.code ?? subject.name).slice(0, 120) : null
  }
  const last = checkIns
    .filter((row) => row.date <= today && row.energy !== null && row.mood !== null)
    .sort((a, b) => b.date.localeCompare(a.date))[0]
  return {
    day: format(now, 'EEEE, d MMMM'),
    mentorTone: tone,
    blocks: [...blocks]
      .sort(byStart)
      .slice(0, 40)
      .map((block) => ({
        start: clock(block.start_at),
        end: clock(block.end_at),
        mode: blockMode(block.area),
        kind: block.kind,
        title: block.title.slice(0, 200),
        subject: subjectName(block.subject_id),
        status: block.status,
      })),
    deadlines: dueSoon(tasks, now, DEADLINE_HOURS)
      .slice(0, 10)
      .map((task) => ({ title: task.title.slice(0, 200), due: dueLabel(task.due_at, now), subject: subjectName(task.subject_id) })),
    exams: subjects
      .flatMap((subject) => {
        const inDays = subject.exam_date ? daysBetween(today, subject.exam_date) : -1
        return inDays >= 0 && inDays <= EXAM_DAYS ? [{ subject: (subject.code ?? subject.name).slice(0, 120), inDays }] : []
      })
      .sort((a, b) => a.inDays - b.inDays)
      .slice(0, 10),
    reviews: { flashcards: flashcardsDue, mistakes: mistakesDue },
    lastCheckIn:
      last && last.energy !== null && last.mood !== null
        ? { daysAgo: daysBetween(last.date, today), energy: last.energy, mood: last.mood, topDistraction: last.top_distraction?.slice(0, 120) ?? null }
        : null,
    minimumDay: checkIns.some((row) => row.date === today && row.minimum_day),
    burnoutGuard: guardOn(today, checkIns),
  }
}

type BriefBlock = BriefRequest['blocks'][number]
const isOpen = (block: BriefBlock) => block.status === 'planned' || block.status === 'in_progress'
const about = (block: BriefBlock) => `${block.title}${block.subject ? ` (${block.subject})` : ''}`
const daysAgoLabel = (days: number) => (days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`)

/** The brief made on the device (Demo Mode): the main focus, what's coming up, and one tip. */
export function deviceBrief(input: BriefRequest): string[] {
  return [focusLine(input), comingUpLine(input), tipLine(input)]
}

function focusLine({ blocks, minimumDay }: BriefRequest): string {
  const open = blocks.filter(isOpen)
  const work = open.filter((block) => block.kind === 'task' || block.kind === 'learn')
  // Deadline work first, then the first topic of the day.
  const focus = work.find((block) => block.kind === 'task') ?? work[0]
  if (minimumDay) {
    return focus ? `Minimum day: just ${about(focus)} at ${focus.start}, and a few reviews. That's enough.` : 'Minimum day: rest, and do a few reviews if you can.'
  }
  if (!focus) return open.length > 0 ? 'No study blocks today: time for your hustle, your life and some rest.' : 'Nothing more is planned for today.'
  return `Main focus: ${about(focus)} at ${focus.start}.${work.length > 1 ? ` ${work.length} study blocks in all.` : ''}`
}

function comingUpLine({ deadlines, exams }: BriefRequest): string {
  if (deadlines.length > 0) {
    // "Due Fri 5:00 PM" → "Fri 5:00 PM", "Overdue by 2 h" → "overdue by 2 h"
    const when = (due: string) => (due.startsWith('Due ') ? due.slice(4) : due.charAt(0).toLowerCase() + due.slice(1))
    const list = deadlines.slice(0, 2).map((task) => `${task.title} (${when(task.due)})`)
    return `Due soon: ${list.join(', ')}${deadlines.length > 2 ? ` and ${deadlines.length - 2} more` : ''}.`
  }
  const exam = exams[0]
  if (exam) {
    const when = exam.inDays === 0 ? 'today' : exam.inDays === 1 ? 'tomorrow' : `in ${exam.inDays} days`
    return `Next exam: ${exam.subject} ${when}. Today's blocks keep you on pace.`
  }
  return 'No deadlines in the next 7 days: a good time to get ahead.'
}

function tipLine({ burnoutGuard, minimumDay, lastCheckIn, reviews, blocks }: BriefRequest): string {
  if (burnoutGuard) return 'Burnout Guard is on: today is 30% lighter. Rest is part of the plan too.'
  if (minimumDay) return 'Be kind to yourself: the rest of your work is already spread over the next days.'
  if (lastCheckIn && lastCheckIn.energy <= 2) {
    return `Your energy was low (${lastCheckIn.energy}/5) ${daysAgoLabel(lastCheckIn.daysAgo)}: start with the easiest block and take real breaks.`
  }
  const waiting = [reviews.flashcards > 0 ? countLabel(reviews.flashcards, 'flashcard') : null, reviews.mistakes > 0 ? countLabel(reviews.mistakes, 'mistake') : null].filter(Boolean)
  if (waiting.length > 0) {
    return `${waiting.join(' and ')} ${reviews.flashcards + reviews.mistakes === 1 ? 'is' : 'are'} waiting for review: a few minutes clears them.`
  }
  const distraction = lastCheckIn?.topDistraction
  if (lastCheckIn && distraction && distraction !== 'Nothing really') {
    return `Your biggest distraction ${daysAgoLabel(lastCheckIn.daysAgo)} was ${distraction.toLowerCase()}: keep it out of reach while you focus.`
  }
  const minutes = { study: 0, hustle: 0, life: 0 }
  for (const block of blocks.filter(isOpen)) minutes[block.mode] += Math.max(0, parseTime(block.end) - parseTime(block.start))
  return `Today: Study ${minutesLabel(minutes.study)} · Hustle ${minutesLabel(minutes.hustle)} · Life ${minutesLabel(minutes.life)}.`
}

/** Writes a brief: the AI when signed in (the device's brief if the AI isn't available), the device in Demo Mode. */
export async function writeBrief(source: DataSource, input: BriefRequest, date: LocalDate): Promise<Brief> {
  if (source.kind === 'demo') return { date, lines: deviceBrief(input), by: 'device', aiError: null }
  try {
    const answer = await callAiFunction('ai-brief', input, BriefResponseSchema)
    return { date, lines: answer.lines, by: 'ai', aiError: null }
  } catch (error) {
    return { date, lines: deviceBrief(input), by: 'device', aiError: error instanceof Error ? error.message : 'The AI is not available.' }
  }
}

const briefKey = (owner: string) => `ekagra-brief:${owner}`

/** Today's brief, if one was written on this device today. */
export function readBrief(owner: string, date: LocalDate): Brief | null {
  try {
    const parsed = BriefSchema.safeParse(JSON.parse(localStorage.getItem(briefKey(owner)) ?? 'null'))
    return parsed.success && parsed.data.date === date ? parsed.data : null
  } catch {
    return null
  }
}

function keepBrief(owner: string, brief: Brief): void {
  try {
    localStorage.setItem(briefKey(owner), JSON.stringify(brief))
  } catch {
    // Storage is blocked: the brief is just written again next time.
  }
}

/** Today's brief: written once the day's plan is up to date, then kept for the day. */
export function useMorningBrief() {
  const { source, owner } = useDataSource()
  const now = useNow(60_000)
  const today = localDateOf(now)
  const blocks = useBlocks(today, today)
  const tasks = useTasks()
  const subjects = useSubjects()
  const cards = useFlashcards()
  const reviews = useReviewsToday(now)
  const mistakes = useMistakes()
  const checkIns = useCheckIns(today)
  const profile = useProfile()
  const fingerprint = usePlanFingerprint()

  const input =
    blocks.data && tasks.data && subjects.data && cards.data && reviews.data && mistakes.data && checkIns.data && profile.data
      ? briefInput({
          now,
          today,
          blocks: blocks.data,
          tasks: tasks.data,
          subjects: subjects.data,
          flashcardsDue: todaysQueue(cards.data, reviews.data, readSettings(profile.data.settings).learning.newCardsPerDay, now).length,
          mistakesDue: dueMistakes(mistakes.data, endOfDay(now)).length,
          checkIns: checkIns.data,
          tone: toMentorTone(profile.data.mentor_tone),
        })
      : null
  // On the first visit of a day the plan keeper re-plans first; the brief waits for that plan.
  const planReady = owner !== null && fingerprint !== null && planIsFresh(readPlanRun(owner), today, fingerprint)

  const query = useQuery({
    queryKey: ['brief', owner, today],
    queryFn: async () => {
      if (!input) throw new Error('Your plan is still loading.')
      const brief = await writeBrief(need(source), input, today)
      if (owner) keepBrief(owner, brief)
      return brief
    },
    initialData: () => (owner ? (readBrief(owner, today) ?? undefined) : undefined),
    enabled: input !== null && planReady,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  })

  return {
    brief: query.data ?? null,
    isWriting: query.isFetching,
    error: query.error,
    canRefresh: input !== null,
    refresh: () => void query.refetch(),
  }
}
