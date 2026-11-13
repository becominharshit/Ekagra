import { beforeEach, describe, expect, it } from 'vitest'
import { listCards } from '@/features/flashcards/flashcards'
import { listTasks } from '@/features/tasks/tasks'
import type { DataSource } from '@/lib/dataSource'
import { stubLocalStorage } from '@/test/memoryStorage'
import { loadRoadmap } from './roadmap'
import { STARTER_PACKS, applyStarterPack } from './starterPacks'
import { listSubjects } from './subjects'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const TODAY = '2026-11-14'

beforeEach(() => {
  localStorage.clear()
})

describe('1-click Major/Goal Starter Packs (Demo Mode)', () => {
  it('seeds subjects, roadmaps, FSRS flashcards, and tasks for every starter pack cleanly', async () => {
    for (const pack of STARTER_PACKS) {
      localStorage.clear()
      const result = await applyStarterPack(DEMO, pack.id, TODAY)
      expect(result.subjectsAdded).toBe(pack.subjects.length)
      expect(result.cardsAdded).toBeGreaterThan(0)
      expect(result.tasksAdded).toBe(pack.tasks.length)

      const subjects = await listSubjects(DEMO)
      expect(subjects.map((s) => s.name)).toEqual(pack.subjects.map((s) => s.name))

      const firstSubject = subjects[0]
      if (!firstSubject) throw new Error('Expected starter pack subject')
      const roadmap = await loadRoadmap(DEMO, firstSubject.id)
      expect(roadmap.topics.length).toBeGreaterThan(1)

      const cards = await listCards(DEMO)
      expect(cards).toHaveLength(result.cardsAdded)
      expect(cards[0]?.fsrs).toEqual({})

      const tasks = await listTasks(DEMO)
      expect(tasks).toHaveLength(pack.tasks.length)
    }
  })

  it('skips duplicate subjects idempotently when clicked again', async () => {
    const first = await applyStarterPack(DEMO, 'cs-undergrad', TODAY)
    expect(first.subjectsAdded).toBe(2)

    const second = await applyStarterPack(DEMO, 'cs-undergrad', TODAY)
    expect(second.subjectsAdded).toBe(0)
    expect(second.cardsAdded).toBe(0)
    expect(second.tasksAdded).toBe(0)
    expect(await listSubjects(DEMO)).toHaveLength(2)
  })
})
