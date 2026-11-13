import { addCards } from '@/features/flashcards/flashcards'
import { addDays } from '@/features/planner/time'
import type { LocalDate } from '@/features/planner/types'
import { addTasks } from '@/features/tasks/tasks'
import type { DataSource } from '@/lib/dataSource'
import type { TablesInsert } from '@/types/database'
import { savePaper } from './papers'
import type { QuestionDraft, QuestionType } from './pastPapers'
import { loadRoadmap, saveRoadmap } from './roadmap'
import { createSubject, listSubjects } from './subjects'
import type { DraftTopic, DraftTree } from './topicTree'

export type StarterPackId = 'cs-undergrad' | 'stem-premed' | 'competitive-exams' | 'indie-builder'

type PackTopic = [key: string, title: string, minutes: number, difficulty: number, examWeight: number, needs: string[]]

interface PackSubjectSpec {
  name: string
  code: string
  kind?: 'course' | 'skill_course'
  examInDays?: number
  weeklyMinutesLimit?: number
  units: { title: string; track?: 'skill'; topics: PackTopic[] }[]
  paper?: { year: number; examType: string; questions: [string, number, QuestionType, string | null][] }
  flashcards: { front: string; back: string; topicKey?: string }[]
}

export interface StarterPack {
  id: StarterPackId
  title: string
  tagline: string
  subjects: PackSubjectSpec[]
  tasks: { title: string; subjectCode?: string; dueInDays: number; estMinutes: number; priority: 1 | 2 | 3 }[]
}

export const STARTER_PACKS: StarterPack[] = [
  {
    id: 'cs-undergrad',
    title: 'CS Undergrad',
    tagline: 'DSA, DBMS & OS roadmaps, past paper prompts, FSRS flashcards, and coding lab tasks.',
    subjects: [
      {
        name: 'Data Structures & Algorithms',
        code: 'DSA',
        examInDays: 35,
        units: [
          {
            title: 'Unit 1: Complexity & linear structures',
            topics: [
              ['asym', 'Asymptotic notation & recurrences', 90, 2, 0.7, []],
              ['trees', 'Trees, heaps & traversals', 150, 3, 0.9, ['asym']],
            ],
          },
          {
            title: 'Unit 2: Graphs & dynamic programming',
            topics: [
              ['graphs', 'Shortest paths & MSTs', 150, 4, 0.9, ['trees']],
              ['dp', 'Dynamic programming patterns', 180, 5, 1.0, ['asym']],
            ],
          },
        ],
        paper: {
          year: 2024,
          examType: 'End semester',
          questions: [
            ['Trace Dijkstra from source A on a weighted directed graph.', 10, 'long', 'graphs'],
            ['Solve 0/1 Knapsack using bottom-up tabulation.', 10, 'code', 'dp'],
          ],
        },
        flashcards: [
          { front: 'Time complexity of heapify (build-heap) on n items?', back: 'O(n) bottom-up', topicKey: 'trees' },
          { front: 'When does Dijkstra fail?', back: 'Negative-weight edges (use Bellman-Ford instead)', topicKey: 'graphs' },
        ],
      },
      {
        name: 'Database Management Systems',
        code: 'DBMS',
        examInDays: 28,
        units: [
          {
            title: 'Unit 1: Relational design',
            topics: [
              ['er', 'ER modeling & relational algebra', 90, 2, 0.6, []],
              ['norm', 'Normalization up to BCNF', 140, 4, 0.9, ['er']],
            ],
          },
          {
            title: 'Unit 2: Transactions',
            topics: [['acid', 'ACID, 2PL & MVCC', 120, 4, 0.8, ['er']]],
          },
        ],
        flashcards: [
          { front: 'BCNF rule in one line?', back: 'For every nontrivial X -> Y, X must be a superkey', topicKey: 'norm' },
          { front: 'What does 2PL prevent?', back: 'Non-serializable interleavings (ensures conflict serializability)', topicKey: 'acid' },
        ],
      },
    ],
    tasks: [
      { title: 'Solve 3 two-pointer problems in Coding Lab', subjectCode: 'DSA', dueInDays: 2, estMinutes: 45, priority: 2 },
      { title: 'Review DBMS normalization FSRS deck', subjectCode: 'DBMS', dueInDays: 1, estMinutes: 20, priority: 1 },
    ],
  },
  {
    id: 'stem-premed',
    title: 'STEM / Pre-Med',
    tagline: 'Organic Chemistry, Anatomy & Applied Calculus with mechanism drills and active recall.',
    subjects: [
      {
        name: 'Organic Chemistry & Mechanisms',
        code: 'CHEM201',
        examInDays: 32,
        units: [
          {
            title: 'Unit 1: Structure & substitution',
            topics: [
              ['stereo', 'Stereochemistry & chirality', 120, 3, 0.8, []],
              ['sn1sn2', 'SN1 vs SN2 & E1/E2 competition', 150, 4, 1.0, ['stereo']],
            ],
          },
          {
            title: 'Unit 2: Carbonyl reactivity',
            topics: [['aldol', 'Aldol & nucleophilic acyl addition', 150, 4, 0.9, ['sn1sn2']]],
          },
        ],
        paper: {
          year: 2024,
          examType: 'Midterm review',
          questions: [
            ['Predict major product and stereochemistry for secondary substrate with NaCN in DMSO.', 5, 'short', 'sn1sn2'],
          ],
        },
        flashcards: [
          { front: 'SN2 stereochemical outcome?', back: '100% inversion of configuration (Walden inversion)', topicKey: 'sn1sn2' },
          { front: 'Polar aprotic solvents favor which pathway?', back: 'SN2 by leaving nucleophiles unsolvated', topicKey: 'sn1sn2' },
        ],
      },
      {
        name: 'Human Anatomy & Physiology',
        code: 'BIO210',
        examInDays: 40,
        units: [
          {
            title: 'Unit 1: Neuro & Cardiovascular',
            topics: [
              ['ap', 'Action potential & synaptic transmission', 120, 3, 0.8, []],
              ['cardiac', 'Cardiac cycle & Frank-Starling law', 140, 4, 0.9, ['ap']],
            ],
          },
        ],
        flashcards: [
          { front: 'Which ion influx drives depolarization at the axon hillock?', back: 'Voltage-gated Na+ channel influx', topicKey: 'ap' },
          { front: 'Primary pacemaker of the human heart?', back: 'Sinoatrial (SA) node in right atrium', topicKey: 'cardiac' },
        ],
      },
    ],
    tasks: [
      { title: 'Practice 10 SN1/SN2 mechanism problems', subjectCode: 'CHEM201', dueInDays: 2, estMinutes: 40, priority: 1 },
      { title: 'Create Image Occlusion deck for cardiac chambers', subjectCode: 'BIO210', dueInDays: 3, estMinutes: 30, priority: 2 },
    ],
  },
  {
    id: 'competitive-exams',
    title: 'Competitive Exams',
    tagline: 'Quantitative Aptitude, LRDI & Core Revision sprints with timed mock habits.',
    subjects: [
      {
        name: 'Quantitative Aptitude & Algebra',
        code: 'QUANT',
        examInDays: 45,
        units: [
          {
            title: 'Speed math & arithmetic',
            topics: [
              ['ratios', 'Percentages, ratios & mixtures', 120, 2, 0.9, []],
              ['pnc', 'Permutations, combinations & probability', 160, 4, 1.0, ['ratios']],
            ],
          },
        ],
        flashcards: [
          { front: 'Compound growth rate shortcut for two +r% changes?', back: '2r + (r^2 / 100)% effective change', topicKey: 'ratios' },
          { front: 'Circular permutation of n distinct items?', back: '(n - 1)! arrangements', topicKey: 'pnc' },
        ],
      },
      {
        name: 'Logical Reasoning & Data Interpretation',
        code: 'LRDI',
        examInDays: 45,
        units: [
          {
            title: 'Analytical sets',
            topics: [
              ['tables', 'Multi-variable grids & scheduling puzzles', 140, 3, 0.9, []],
              ['charts', 'Caselets & approximation DI', 120, 3, 0.8, ['tables']],
            ],
          },
        ],
        flashcards: [
          { front: 'Fraction equivalent of 1/7 & 1/12?', back: '14.28% and 8.33%', topicKey: 'charts' },
        ],
      },
    ],
    tasks: [
      { title: 'Complete 20-min timed Quant speed set', subjectCode: 'QUANT', dueInDays: 1, estMinutes: 25, priority: 1 },
      { title: 'Audit Mistake Notebook from last mock test', subjectCode: 'LRDI', dueInDays: 2, estMinutes: 30, priority: 2 },
    ],
  },
  {
    id: 'indie-builder',
    title: 'Indie Builder',
    tagline: 'Weekly skill tracks for Systems Architecture & Shipping, FSRS drills, and launch tasks.',
    subjects: [
      {
        name: 'Full-Stack System Architecture',
        code: 'SYS',
        kind: 'skill_course',
        weeklyMinutesLimit: 300,
        units: [
          {
            title: 'Core engineering stack',
            track: 'skill',
            topics: [
              ['auth-rls', 'Auth, Postgres RLS & idempotent webhooks', 120, 3, 0, []],
              ['perf', 'Indexing, edge caching & observability', 120, 3, 0, ['auth-rls']],
            ],
          },
        ],
        flashcards: [
          { front: 'Why wrap auth.uid() inside (select auth.uid()) in Postgres RLS?', back: 'InitPlan caches auth.uid() once per statement instead of per row', topicKey: 'auth-rls' },
          { front: 'Best webhook deduplication guarantee?', back: 'Unique constraint on (provider, event_id) before mutating state', topicKey: 'auth-rls' },
        ],
      },
      {
        name: 'Product Distribution & Growth',
        code: 'SHIP',
        kind: 'skill_course',
        weeklyMinutesLimit: 180,
        units: [
          {
            title: 'Launch loop',
            track: 'skill',
            topics: [
              ['icp', 'Onboarding friction & activation metrics', 90, 2, 0, []],
              ['pricing', 'Global SaaS & regional PPP pricing', 90, 2, 0, ['icp']],
            ],
          },
        ],
        flashcards: [
          { front: 'North-star onboarding metric?', back: 'Time-to-first-value (TTFV) before gating credentials', topicKey: 'icp' },
        ],
      },
    ],
    tasks: [
      { title: 'Talk to 3 beta users about onboarding friction', subjectCode: 'SHIP', dueInDays: 2, estMinutes: 45, priority: 1 },
      { title: 'Benchmark slow DB query with EXPLAIN ANALYZE', subjectCode: 'SYS', dueInDays: 3, estMinutes: 40, priority: 2 },
    ],
  },
]

function buildDraftTree(spec: PackSubjectSpec): DraftTree {
  return {
    units: spec.units.map((unit) => ({
      title: unit.title,
      topics: unit.topics.map(([key, title, estMinutes, difficulty, examWeight, prerequisites]): DraftTopic => ({
        key,
        title,
        track: unit.track ?? 'exam',
        estMinutes,
        difficulty,
        examWeight,
        prerequisites,
      })),
    })),
  }
}

export interface StarterPackResult {
  packId: StarterPackId
  subjectsAdded: number
  cardsAdded: number
  tasksAdded: number
}

/**
 * Seeds curated subjects, syllabus roadmaps, starter flashcards, and tasks for the selected pack
 * using the active DataSource (Demo Mode or Supabase). Already-existing subjects (by name) are skipped.
 */
export async function applyStarterPack(
  source: DataSource,
  packId: StarterPackId,
  today: LocalDate,
): Promise<StarterPackResult> {
  const pack = STARTER_PACKS.find((item) => item.id === packId)
  if (!pack) throw new Error(`Unknown starter pack: ${packId}`)

  const existing = await listSubjects(source)
  const existingByName = new Map(existing.map((s) => [s.name.trim().toLowerCase(), s]))
  const codeToSubjectId = new Map<string, string>()
  for (const s of existing) {
    if (s.code) codeToSubjectId.set(s.code.toUpperCase(), s.id)
  }

  let subjectsAdded = 0
  const cardsToInsert: TablesInsert<'flashcards'>[] = []

  for (const spec of pack.subjects) {
    const matched = existingByName.get(spec.name.trim().toLowerCase())
    if (matched) {
      codeToSubjectId.set(spec.code.toUpperCase(), matched.id)
      continue
    }

    const subject = await createSubject(source, {
      name: spec.name,
      code: spec.code,
      kind: spec.kind ?? 'course',
      exam_date: spec.kind === 'skill_course' || spec.examInDays === undefined ? null : addDays(today, spec.examInDays),
      weekly_minutes_limit: spec.weeklyMinutesLimit ?? null,
    })
    subjectsAdded += 1
    codeToSubjectId.set(spec.code.toUpperCase(), subject.id)

    await saveRoadmap(source, { subjectId: subject.id, draft: buildDraftTree(spec) })
    const roadmap = await loadRoadmap(source, subject.id)
    const idByTitle = new Map(roadmap.topics.map((topic) => [topic.title, topic.id]))
    const titleByKey = new Map(spec.units.flatMap((unit) => unit.topics.map(([key, title]) => [key, title] as const)))

    if (spec.paper) {
      const questions: QuestionDraft[] = spec.paper.questions.map(([text, marks, type, key]) => ({
        text,
        marks,
        type,
        topicId: key ? (idByTitle.get(titleByKey.get(key) ?? '') ?? null) : null,
      }))
      await savePaper(source, {
        subjectId: subject.id,
        year: spec.paper.year,
        examType: spec.paper.examType,
        questions,
        promptVersion: null,
      })
    }

    for (const card of spec.flashcards) {
      const topicId = card.topicKey ? (idByTitle.get(titleByKey.get(card.topicKey) ?? '') ?? null) : null
      cardsToInsert.push({
        front: card.front,
        back: card.back,
        topic_id: topicId,
        source: 'manual',
      })
    }
  }

  await addCards(source, cardsToInsert)

  let tasksAdded = 0
  if (subjectsAdded > 0 && pack.tasks.length > 0) {
    const rows: TablesInsert<'tasks'>[] = pack.tasks.map((task) => ({
      title: task.title,
      area: 'academics',
      subject_id: task.subjectCode ? (codeToSubjectId.get(task.subjectCode.toUpperCase()) ?? null) : null,
      due_at: `${addDays(today, task.dueInDays)}T18:00:00.000Z`,
      est_minutes: task.estMinutes,
      priority: task.priority,
    }))
    await addTasks(source, rows)
    tasksAdded = rows.length
  }

  return {
    packId: pack.id,
    subjectsAdded,
    cardsAdded: cardsToInsert.length,
    tasksAdded,
  }
}
