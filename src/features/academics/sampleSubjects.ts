import { addDays } from '@/features/planner/time'
import type { LocalDate } from '@/features/planner/types'
import type { DataSource } from '@/lib/dataSource'
import { savePaper } from './papers'
import type { QuestionDraft, QuestionType } from './pastPapers'
import { loadRoadmap, saveRoadmap } from './roadmap'
import { createSubject } from './subjects'
import type { DraftTree, DraftTopic } from './topicTree'

// Two sample subjects for Demo Mode (DBMS and Python), each with a roadmap and one past paper, so
// every screen and the plan have something real to show. They are saved through the same functions
// as the student's own subjects, and exam dates are counted from today so they never go stale.

type SampleTopic = [key: string, title: string, minutes: number, difficulty: number, examWeight: number, needs: string[]]

interface Sample {
  name: string
  code: string
  examInDays: number
  units: { title: string; track?: 'skill'; topics: SampleTopic[] }[]
  /** One past paper: [question, marks, type, topic key]. */
  paper: { year: number; examType: string; questions: [string, number, QuestionType, string | null][] }
}

const SAMPLES: Sample[] = [
  {
    name: 'Database Management Systems',
    code: 'DBMS',
    examInDays: 30,
    units: [
      {
        title: 'Unit 1: Data models',
        topics: [
          ['er', 'ER model', 90, 2, 0.6, []],
          ['ra', 'Relational algebra', 120, 3, 0.7, ['er']],
        ],
      },
      {
        title: 'Unit 2: SQL and transactions',
        topics: [
          ['sql', 'SQL queries', 150, 2, 0.9, ['ra']],
          ['tx', 'Transactions and concurrency', 120, 4, 0.7, ['sql']],
        ],
      },
      { title: 'Unit 3: Database design', topics: [['norm', 'Normalization (1NF to BCNF)', 150, 4, 0.9, ['ra']]] },
      { title: 'Skill track', track: 'skill', topics: [['window', 'Modern SQL: window functions', 120, 3, 0, ['sql']]] },
    ],
    paper: {
      year: 2024,
      examType: 'End semester',
      questions: [
        ['Draw an ER diagram for a library system.', 10, 'long', 'er'],
        ['Write relational algebra for students who passed all courses.', 5, 'short', 'ra'],
        ['Write a SQL query using GROUP BY and HAVING.', 10, 'code', 'sql'],
        ['Explain inner, left and full outer joins.', 5, 'short', 'sql'],
        ['Normalize the given relation up to BCNF.', 10, 'long', 'norm'],
        ['Explain 3NF with an example.', 5, 'short', 'norm'],
        ['Explain two-phase locking.', 5, 'short', 'tx'],
      ],
    },
  },
  {
    name: 'Python Programming',
    code: 'PY101',
    examInDays: 45,
    units: [
      {
        title: 'Unit 1: Basics',
        topics: [
          ['vars', 'Variables, types and input', 60, 1, 0.5, []],
          ['loops', 'Loops and conditions', 90, 2, 0.8, ['vars']],
        ],
      },
      {
        title: 'Unit 2: Building blocks',
        topics: [
          ['functions', 'Functions', 90, 2, 0.8, ['loops']],
          ['classes', 'Classes and objects', 150, 4, 0.9, ['functions']],
        ],
      },
    ],
    paper: {
      year: 2024,
      examType: 'End semester',
      questions: [
        ['Write a program to print the first n prime numbers.', 5, 'code', 'loops'],
        ['Write a function that returns the factorial of n.', 10, 'code', 'functions'],
        ['Create a class BankAccount with deposit and withdraw.', 10, 'code', 'classes'],
        ['Explain the difference between a list and a tuple.', 2, 'short', 'vars'],
      ],
    },
  },
]

function draftOf(sample: Sample): DraftTree {
  return {
    units: sample.units.map((unit) => ({
      title: unit.title,
      topics: unit.topics.map(([key, title, estMinutes, difficulty, examWeight, needs]): DraftTopic => ({
        key,
        title,
        track: unit.track ?? 'exam',
        estMinutes,
        difficulty,
        examWeight,
        prerequisites: needs,
      })),
    })),
  }
}

/** Adds the sample subjects with their roadmaps and past papers. */
export async function addSampleSubjects(source: DataSource, today: LocalDate): Promise<void> {
  for (const sample of SAMPLES) {
    const subject = await createSubject(source, { name: sample.name, code: sample.code, exam_date: addDays(today, sample.examInDays) })
    await saveRoadmap(source, { subjectId: subject.id, draft: draftOf(sample) })
    // The saved topics have new ids: match the paper's questions to them by title.
    const roadmap = await loadRoadmap(source, subject.id)
    const idByTitle = new Map(roadmap.topics.map((topic) => [topic.title, topic.id]))
    const titleByKey = new Map(sample.units.flatMap((unit) => unit.topics.map(([key, title]) => [key, title] as const)))
    const questions: QuestionDraft[] = sample.paper.questions.map(([text, marks, type, key]) => ({
      text,
      marks,
      type,
      topicId: key ? (idByTitle.get(titleByKey.get(key) ?? '') ?? null) : null,
    }))
    await savePaper(source, { subjectId: subject.id, year: sample.paper.year, examType: sample.paper.examType, questions, promptVersion: null })
  }
}
