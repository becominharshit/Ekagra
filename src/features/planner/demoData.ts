import { priorityScores, type PriorityInput } from './priority'
import { addDays } from './time'
import type { LocalDate, PlannerSubject, PlannerTask, PlannerTopic } from './types'

// Sample study data for Demo Mode, so the plan preview shows real-looking study blocks before
// subjects can be added (Milestone 3). Dates are counted from "today", so the demo never goes stale.

interface DemoTopic extends PriorityInput {
  subjectId: string
  title: string
  minutes: number
  difficulty: number
  track: 'exam' | 'skill'
}

const DEMO_TOPICS: DemoTopic[] = [
  // DBMS
  { id: 'er-model', subjectId: 'dbms', title: 'ER model', minutes: 90, difficulty: 2, track: 'exam', examWeight: 0.6, pyqCount: 3, pyqMarksShare: 0.12, prerequisiteIds: [] },
  { id: 'relational-algebra', subjectId: 'dbms', title: 'Relational algebra', minutes: 120, difficulty: 3, track: 'exam', examWeight: 0.7, pyqCount: 4, pyqMarksShare: 0.16, prerequisiteIds: ['er-model'] },
  { id: 'sql', subjectId: 'dbms', title: 'SQL queries', minutes: 150, difficulty: 2, track: 'exam', examWeight: 0.9, pyqCount: 6, pyqMarksShare: 0.25, prerequisiteIds: ['relational-algebra'] },
  { id: 'normalization', subjectId: 'dbms', title: 'Normalization (1NF to BCNF)', minutes: 150, difficulty: 4, track: 'exam', examWeight: 0.9, pyqCount: 5, pyqMarksShare: 0.22, prerequisiteIds: ['relational-algebra'] },
  { id: 'transactions', subjectId: 'dbms', title: 'Transactions and concurrency', minutes: 120, difficulty: 4, track: 'exam', examWeight: 0.7, pyqCount: 4, pyqMarksShare: 0.15, prerequisiteIds: ['sql'] },
  { id: 'window-functions', subjectId: 'dbms', title: 'Modern SQL: window functions', minutes: 120, difficulty: 3, track: 'skill', examWeight: 0, pyqCount: 0, pyqMarksShare: 0, prerequisiteIds: ['sql'] },
  // Python
  { id: 'py-basics', subjectId: 'python', title: 'Variables, types and input', minutes: 60, difficulty: 1, track: 'exam', examWeight: 0.5, pyqCount: 2, pyqMarksShare: 0.1, prerequisiteIds: [] },
  { id: 'py-control', subjectId: 'python', title: 'Loops and conditions', minutes: 90, difficulty: 2, track: 'exam', examWeight: 0.8, pyqCount: 5, pyqMarksShare: 0.2, prerequisiteIds: ['py-basics'] },
  { id: 'py-functions', subjectId: 'python', title: 'Functions', minutes: 90, difficulty: 2, track: 'exam', examWeight: 0.8, pyqCount: 4, pyqMarksShare: 0.18, prerequisiteIds: ['py-control'] },
  { id: 'py-oop', subjectId: 'python', title: 'Classes and objects', minutes: 150, difficulty: 4, track: 'exam', examWeight: 0.9, pyqCount: 5, pyqMarksShare: 0.24, prerequisiteIds: ['py-functions'] },
]

export function demoStudyData(today: LocalDate): {
  subjects: PlannerSubject[]
  topics: PlannerTopic[]
  tasks: PlannerTask[]
} {
  const subjects: PlannerSubject[] = [
    { id: 'dbms', name: 'DBMS', examDate: addDays(today, 30) },
    { id: 'python', name: 'Python Programming', examDate: addDays(today, 45) },
  ]

  const topics: PlannerTopic[] = []
  for (const subject of subjects) {
    const own = DEMO_TOPICS.filter((topic) => topic.subjectId === subject.id)
    const scores = priorityScores(own)
    own.forEach((topic, index) => {
      topics.push({
        id: topic.id,
        subjectId: topic.subjectId,
        title: topic.title,
        track: topic.track,
        remainingMinutes: topic.minutes,
        difficulty: topic.difficulty,
        priority: scores.get(topic.id)?.score ?? 0,
        prerequisiteIds: topic.prerequisiteIds,
        orderIndex: index,
      })
    })
  }

  const tasks: PlannerTask[] = [
    { id: 'dbms-assignment', area: 'academics', title: 'DBMS assignment 2', dueDate: addDays(today, 3), remainingMinutes: 90, priority: 1, subjectId: 'dbms' },
    { id: 'proposals', area: 'hustle', title: 'Send 3 freelance proposals', dueDate: addDays(today, 1), remainingMinutes: 45, priority: 2 },
    { id: 'laundry', area: 'personal', title: 'Laundry', dueDate: null, remainingMinutes: 30, priority: 3 },
  ]

  return { subjects, topics, tasks }
}
