import { describe, expect, it, vi } from 'vitest'
import { BriefRequestSchema } from '@shared/schemas.ts'
import { AiRequestError, callAiFunction } from '@/features/ai/aiClient'
import type { CheckIn } from '@/features/checkins/checkins'
import type { PlanBlock } from '@/features/planner/schedule'
import type { Task } from '@/features/tasks/taskRules'
import type { DataSource } from '@/lib/dataSource'
import { stubLocalStorage } from '@/test/memoryStorage'
import { briefInput, deviceBrief, readBrief, writeBrief, type BriefData } from './brief'

vi.mock('@/features/ai/aiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/ai/aiClient')>()),
  callAiFunction: vi.fn(),
}))
stubLocalStorage()

const TODAY = '2026-11-02'
const NOW = new Date(`${TODAY}T08:00:00`) // Monday, local time
const iso = (time: string, date = TODAY) => new Date(`${date}T${time}:00`).toISOString()

function block(title: string, start: string, end: string, values: Partial<PlanBlock> = {}): PlanBlock {
  return {
    id: title,
    user_id: 'u',
    date: TODAY,
    start_at: iso(start),
    end_at: iso(end),
    area: 'academics',
    kind: 'learn',
    subject_id: 'dbms',
    topic_id: null,
    task_id: null,
    hustle_id: null,
    title,
    planned_minutes: (Date.parse(iso(end)) - Date.parse(iso(start))) / 60_000,
    actual_minutes: null,
    status: 'planned',
    at_risk: false,
    plan_version: 1,
    created_at: '',
    updated_at: '',
    ...values,
  }
}

function task(title: string, dueAt: string, values: Partial<Task> = {}): Task {
  return {
    id: title,
    user_id: 'u',
    area: 'academics',
    subject_id: 'dbms',
    hustle_id: null,
    title,
    notes: null,
    due_at: dueAt,
    est_minutes: 120,
    priority: 2,
    status: 'todo',
    source: 'text',
    source_ref: null,
    completed_at: null,
    created_at: '',
    updated_at: '',
    ...values,
  }
}

function checkIn(date: string, values: Partial<CheckIn> = {}): CheckIn {
  return {
    id: date,
    user_id: 'u',
    date,
    minimum_day: false,
    crashed_at: null,
    energy: 4,
    mood: 3,
    top_distraction: null,
    note: null,
    checked_in_at: iso('21:30', date),
    created_at: '',
    updated_at: '',
    ...values,
  }
}

const DATA: BriefData = {
  now: NOW,
  today: TODAY,
  blocks: [
    block('DBMS assignment', '10:00', '10:45', { kind: 'task' }),
    block('ER model', '09:00', '09:45'),
    block('Hustle work', '17:00', '17:45', { area: 'hustle', kind: 'hustle', subject_id: null }),
  ],
  tasks: [
    task('DBMS assignment', iso('17:00', '2026-11-06')),
    task('Pay fees', iso('23:59', '2026-11-03'), { area: 'personal', subject_id: null }),
    task('Project report', iso('12:00', '2026-11-20')),
  ],
  subjects: [
    { id: 'dbms', name: 'Database Management Systems', code: 'DBMS', exam_date: '2026-11-14' },
    { id: 'py', name: 'Python Programming', code: null, exam_date: '2026-12-30' },
  ],
  flashcardsDue: 9,
  mistakesDue: 0,
  checkIns: [checkIn('2026-11-01', { top_distraction: 'Games' })],
  tone: 'friendly',
}

describe('briefInput', () => {
  it("collects today's blocks, deadlines in the next 7 days, exams within 30 days, reviews and the last check-in", () => {
    const input = briefInput(DATA)
    expect(BriefRequestSchema.safeParse(input).success).toBe(true) // ai-brief accepts it
    expect(input).toMatchObject({
      day: 'Monday, 2 November',
      mentorTone: 'friendly',
      deadlines: [
        { title: 'Pay fees', due: 'Due tomorrow', subject: null },
        { title: 'DBMS assignment', due: 'Due Fri 5:00 PM', subject: 'DBMS' },
      ],
      exams: [{ subject: 'DBMS', inDays: 12 }],
      reviews: { flashcards: 9, mistakes: 0 },
      lastCheckIn: { daysAgo: 1, energy: 4, mood: 3, topDistraction: 'Games' },
      minimumDay: false,
      burnoutGuard: false,
    })
    expect(input.blocks.map((row) => `${row.start}-${row.end} ${row.mode} ${row.title} ${row.subject}`)).toEqual([
      '09:00-09:45 study ER model DBMS',
      '10:00-10:45 study DBMS assignment DBMS',
      '17:00-17:45 hustle Hustle work null',
    ])
  })
})

describe('deviceBrief (Demo Mode)', () => {
  it('gives the main focus (deadline work first), what is due soon, and the reviews waiting', () => {
    expect(deviceBrief(briefInput(DATA))).toEqual([
      'Main focus: DBMS assignment (DBMS) at 10:00. 2 study blocks in all.',
      'Due soon: Pay fees (tomorrow), DBMS assignment (Fri 5:00 PM).',
      '9 flashcards are waiting for review: a few minutes clears them.',
    ])
  })

  it('is gentle on a minimum day with the Burnout Guard on, and names the next exam when nothing is due', () => {
    const lowDays = ['2026-10-30', '2026-10-31', '2026-11-01'].map((date) => checkIn(date, { energy: 2 }))
    const lines = deviceBrief(briefInput({ ...DATA, tasks: [], checkIns: [...lowDays, checkIn(TODAY, { minimum_day: true, crashed_at: iso('07:30'), energy: null, mood: null, checked_in_at: null })] }))
    expect(lines).toEqual([
      'Minimum day: just DBMS assignment (DBMS) at 10:00, and a few reviews. That\'s enough.',
      "Next exam: DBMS in 12 days. Today's blocks keep you on pace.",
      'Burnout Guard is on: today is 30% lighter. Rest is part of the plan too.',
    ])
  })

  it('picks a tip from low energy, then reviews, then the biggest distraction, then the plan', () => {
    const tip = (data: Partial<BriefData>) => deviceBrief(briefInput({ ...DATA, ...data }))[2]
    expect(tip({ checkIns: [checkIn('2026-11-01', { energy: 2 })] })).toBe('Your energy was low (2/5) yesterday: start with the easiest block and take real breaks.')
    expect(tip({ flashcardsDue: 0 })).toBe('Your biggest distraction yesterday was games: keep it out of reach while you focus.')
    expect(tip({ flashcardsDue: 0, checkIns: [] })).toBe('Today: Study 1 h 30 min · Hustle 45 min · Life 0 min.')
  })
})

describe('writing and keeping the brief', () => {
  const SIGNED_IN = { kind: 'supabase', userId: 'u', client: {} } as unknown as DataSource
  const LINES = ['One.', 'Two.', 'Three.']

  it('uses the AI when signed in, and the device brief (with the reason) when the AI is not available', async () => {
    const input = briefInput(DATA)
    vi.mocked(callAiFunction).mockResolvedValueOnce({ lines: LINES, model: 'fast', promptVersion: 'brief-v1' })
    expect(await writeBrief(SIGNED_IN, input, TODAY)).toEqual({ date: TODAY, lines: LINES, by: 'ai', aiError: null })

    vi.mocked(callAiFunction).mockRejectedValueOnce(new AiRequestError('quota_exceeded', "You've used today's AI limit."))
    expect(await writeBrief(SIGNED_IN, input, TODAY)).toEqual({ date: TODAY, lines: deviceBrief(input), by: 'device', aiError: "You've used today's AI limit." })

    expect(await writeBrief({ kind: 'demo' }, input, TODAY)).toMatchObject({ by: 'device', aiError: null })
  })

  it("only gives back today's brief from the device", () => {
    localStorage.setItem('ekagra-brief:demo', JSON.stringify({ date: TODAY, lines: LINES, by: 'device', aiError: null }))
    expect(readBrief('demo', TODAY)?.lines).toEqual(LINES)
    expect(readBrief('demo', '2026-11-03')).toBeNull()
    localStorage.setItem('ekagra-brief:demo', '{broken')
    expect(readBrief('demo', TODAY)).toBeNull()
  })
})
