import { describe, expect, it } from 'vitest'
import { capturedToDraft, draftProblems, draftValues, taskToDraft, blankDraft } from './drafts'
import { parseTasks } from './parseTasks'
import { dueLabel, dueSoon, isoWithOffset, toPlannerTasks, type Task } from './taskRules'

const NOW = new Date('2026-11-02T14:30:00') // Monday, local time
const SUBJECTS = [
  { id: 'dbms', name: 'Database Management Systems', code: 'DBMS' },
  { id: 'py', name: 'Python Programming', code: 'PY101' },
]
const read = (text: string) => parseTasks(text, { now: NOW, subjects: SUBJECTS })

describe('parseTasks (Demo Mode reads typed tasks)', () => {
  it('reads "DBMS assignment due Friday 5pm"', () => {
    expect(read('DBMS assignment due Friday 5pm')).toEqual([
      expect.objectContaining({
        title: 'DBMS assignment',
        area: 'academics',
        subjectId: 'dbms',
        dueDate: '2026-11-06',
        dueTime: '17:00',
        estMinutes: 120,
        priority: 2,
        unsure: ['estMinutes'],
      }),
    ])
  })

  it('reads relative days, Indian dates, work time and urgency, one task per line', () => {
    const [record, quiz, bill, client] = read('Submit lab record by tomorrow\nPython quiz prep 15/11 (2h)\npay electricity bill in 3 days urgent\nClient logo for Ravi next week')
    expect(record).toMatchObject({ title: 'Submit lab record', area: 'academics', dueDate: '2026-11-03', dueTime: '', estMinutes: 120 })
    expect(quiz).toMatchObject({ title: 'Python quiz prep', dueDate: '2026-11-15', estMinutes: 120, area: 'academics', subjectId: null })
    expect(quiz?.unsure).toEqual([])
    expect(bill).toMatchObject({ title: 'Pay electricity bill', dueDate: '2026-11-05', priority: 1, area: 'personal' })
    expect(bill?.unsure).toEqual(expect.arrayContaining(['area', 'estMinutes']))
    expect(client).toMatchObject({ area: 'hustle', dueDate: '2026-11-09' })
    expect(client?.unsure).toContain('dueAt') // "next week" is a guess
  })

  it('finds subjects by code or name, and reads month names and 24-hour times', () => {
    const [notes, viva] = read('Revise PY101 loops on 20 Nov at 18:30; database management systems viva Dec 3')
    expect(notes).toMatchObject({ subjectId: 'py', dueDate: '2026-11-20', dueTime: '18:30', title: 'Revise PY101 loops' })
    expect(viva).toMatchObject({ subjectId: 'dbms', dueDate: '2026-12-03', estMinutes: 90 })
  })

  it('marks a missing date as unsure, and a lone time as today (or tomorrow once it has passed)', () => {
    expect(read('call mom')[0]).toMatchObject({ title: 'Call mom', dueDate: '', unsure: expect.arrayContaining(['dueAt', 'area']) })
    expect(read('call mom at 6:30pm')[0]).toMatchObject({ title: 'Call mom', dueDate: '2026-11-02', dueTime: '18:30' })
    expect(read('gym at 7am')[0]).toMatchObject({ dueDate: '2026-11-03', dueTime: '07:00' })
  })
})

describe('drafts', () => {
  it("turns the AI's task into a draft: subject key to id, due time in local time, 23:59 as end of day", () => {
    const draft = capturedToDraft(
      { title: 'DBMS assignment', area: 'academics', subjectKey: 's1', dueAt: new Date('2026-11-06T17:00:00').toISOString(), estMinutes: 120, priority: 2, unsure: ['estMinutes'] },
      new Map([['s1', 'dbms']]),
    )
    expect(draft).toMatchObject({ subjectId: 'dbms', dueDate: '2026-11-06', dueTime: '17:00', unsure: ['estMinutes'] })
    expect(capturedToDraft({ title: 'X', area: 'personal', subjectKey: null, dueAt: new Date('2026-11-06T23:59:00').toISOString(), estMinutes: null, priority: 3, unsure: [] }, new Map()).dueTime).toBe('')
  })

  it('saves a due date without a time as the end of that day, and checks what is missing', () => {
    const draft = { ...blankDraft(), title: ' Essay ', area: 'academics' as const, subjectId: 'dbms', dueDate: '2026-11-06' }
    expect(draftValues(draft)).toEqual({
      title: 'Essay',
      area: 'academics',
      subject_id: 'dbms',
      due_at: new Date('2026-11-06T23:59:00').toISOString(),
      est_minutes: null,
      priority: 2,
    })
    expect(draftValues({ ...draft, area: 'personal' }).subject_id).toBeNull()
    expect(draftProblems({ ...blankDraft(), dueTime: '17:00' })).toEqual(['Every task needs a title.', 'Pick a due date for the time you gave.'])
  })
})

function task(id: string, values: Partial<Task> = {}): Task {
  return {
    id,
    user_id: 'u',
    area: 'academics',
    subject_id: 'dbms',
    hustle_id: null,
    title: id,
    notes: null,
    due_at: null,
    est_minutes: 120,
    priority: 2,
    status: 'todo',
    source: 'manual',
    source_ref: null,
    completed_at: null,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    ...values,
  }
}

describe('task rules', () => {
  it('lists open tasks due within 72 hours (and overdue ones), the soonest first', () => {
    const tasks = [
      task('friday', { due_at: new Date('2026-11-06T17:00:00').toISOString() }),
      task('tomorrow', { due_at: new Date('2026-11-03T09:00:00').toISOString() }),
      task('late', { due_at: new Date('2026-11-01T10:00:00').toISOString() }),
      task('done', { due_at: new Date('2026-11-03T09:00:00').toISOString(), status: 'done' }),
      task('no-date'),
    ]
    expect(dueSoon(tasks, NOW).map((t) => t.id)).toEqual(['late', 'tomorrow'])
  })

  it('says when a task is due', () => {
    const at = (text: string) => new Date(text).toISOString()
    expect(dueLabel(at('2026-11-02T17:00:00'), NOW)).toBe('Due today 5:00 PM')
    expect(dueLabel(at('2026-11-03T23:59:00'), NOW)).toBe('Due tomorrow')
    expect(dueLabel(at('2026-11-06T09:00:00'), NOW)).toBe('Due Fri 9:00 AM')
    expect(dueLabel(at('2026-11-20T09:00:00'), NOW)).toBe('Due 20 Nov')
    expect(dueLabel(at('2026-11-02T12:30:00'), NOW)).toBe('Overdue by 2 h')
    expect(dueLabel(at('2026-10-30T14:30:00'), NOW)).toBe('Overdue by 3 days')
    expect(dueLabel(null, NOW)).toBe('No due date')
  })

  it('gives the planner open tasks with their due time, and work already done taken off the estimate', () => {
    const planner = toPlannerTasks(
      [
        task('essay', { due_at: new Date('2026-11-06T17:00:00').toISOString() }),
        task('old', { status: 'done' }),
        task('chores', { area: 'personal', est_minutes: null, subject_id: null }),
        task('record', { due_at: new Date('2026-11-03T23:59:00').toISOString() }),
      ],
      new Map([['essay', 45]]),
    )
    expect(planner).toEqual([
      { id: 'essay', area: 'academics', title: 'essay', dueDate: '2026-11-06', dueMinute: 17 * 60, remainingMinutes: 75, priority: 2, subjectId: 'dbms' },
      { id: 'chores', area: 'personal', title: 'chores', dueDate: null, dueMinute: null, remainingMinutes: 60, priority: 2, subjectId: null },
      // 23:59 = by the end of the day: no set time.
      { id: 'record', area: 'academics', title: 'record', dueDate: '2026-11-03', dueMinute: null, remainingMinutes: 120, priority: 2, subjectId: 'dbms' },
    ])
  })

  it("writes the time with the device's UTC offset for the AI", () => {
    expect(isoWithOffset(NOW)).toMatch(/^2026-11-02T14:30:00([+-]\d\d:\d\d|Z)$/)
    expect(taskToDraft(task('x', { due_at: new Date('2026-11-06T17:00:00').toISOString() }))).toMatchObject({ dueDate: '2026-11-06', dueTime: '17:00' })
  })
})
