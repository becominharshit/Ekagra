import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { stubLocalStorage } from '@/test/memoryStorage'
import { archiveHabit, listHabitLogs, listHabits, logHabit, saveHabit } from './habitsData'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }

describe('habits in Demo Mode', () => {
  it('adds habits in order, changes and hides them', async () => {
    await saveHabit(DEMO, { title: ' Drink water ', kind: 'water', days: [3, 1, 1], target: 8, unit: 'glasses' })
    await saveHabit(DEMO, { title: 'Read', kind: 'study', days: [0, 1, 2, 3, 4, 5, 6], target: null, unit: 'pages' })
    const [water, read] = await listHabits(DEMO)
    expect(water).toMatchObject({ title: 'Drink water', days_of_week: [1, 3], target: 8, unit: 'glasses', order_index: 0 })
    expect(read).toMatchObject({ title: 'Read', unit: null, order_index: 1 }) // no target: no unit

    await saveHabit(DEMO, { id: read?.id, title: 'Read 20 minutes', kind: 'study', days: [1], target: null, unit: null })
    await archiveHabit(DEMO, water?.id ?? '')
    expect((await listHabits(DEMO)).map((habit) => habit.title)).toEqual(['Read 20 minutes'])
    await expect(saveHabit(DEMO, { title: '', kind: 'custom', days: [1], target: null, unit: null })).rejects.toThrow(/name/)
  })

  it('keeps one log per habit and day: logging again changes it', async () => {
    await saveHabit(DEMO, { title: 'Drink water', kind: 'water', days: [0, 1, 2, 3, 4, 5, 6], target: 8, unit: 'glasses' })
    const [water] = await listHabits(DEMO)
    const habitId = water?.id ?? ''
    await logHabit(DEMO, { habitId, date: '2026-11-02', done: false, value: 3 })
    await logHabit(DEMO, { habitId, date: '2026-11-02', done: false, value: 8 })
    await logHabit(DEMO, { habitId, date: '2026-10-01', done: true, value: 0 })
    expect((await listHabitLogs(DEMO, '2026-11-01')).map((log) => [log.date, log.value])).toEqual([['2026-11-02', 8]])
  })
})
