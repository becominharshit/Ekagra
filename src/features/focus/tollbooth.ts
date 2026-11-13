import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { academicsKey } from '@/features/academics/subjects'
import { CARD_STATE } from '@/features/flashcards/fsrs'
import { givenText, readCheckQuestion, rightAnswerText, type StoredCheckQuestion } from '@/features/lessons/quiz'
import { mistakeFsrsStats, mistakeWeaknessScore, type Mistake } from '@/features/mistakes/ladder'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Json, Tables, TablesInsert } from '@/types/database'
import { distractionsKey, type DistractionEvent } from './distractions'

// The Academic Tollbooth: to open a blocked app during focus (an emergency unlock), answer 3
// rapid-fire questions from the subject you're studying, then say why. All right: blocked apps
// open for a few minutes (a tollbooth_unlock event). One wrong: they stay blocked
// (tollbooth_failed) and the missed concept can go into the Mistake Notebook. A few a day at most.
// Prioritization: open mistakes + due/weak/lapsed FSRS flashcards + coding debugging prompts
// (when working in Coding Lab) + subject MCQs/numericals + built-in mental maths.

export const SECONDS_PER_QUESTION = 20
/** After a wrong try, the next one can start after this many seconds. */
export const COOLDOWN_SECONDS = 60
/** Answers longer than this can't be read as a choice in 20 seconds. */
const MAX_CHOICE_LENGTH = 140

type Question = Tables<'questions'>
type Card = Pick<Tables<'flashcards'>, 'id' | 'front' | 'back' | 'topic_id' | 'suspended'> & {
  fsrs?: Json
  due_at?: string | null
}
type Topic = Pick<Tables<'topics'>, 'id' | 'subject_id'>
type MistakeSummary = Pick<
  Mistake,
  'id' | 'topic_id' | 'question_id' | 'flashcard_id' | 'concept' | 'why_wrong' | 'correct_approach' | 'status' | 'fsrs' | 'next_review_at' | 'correct_count'
>
type SnippetSummary = Pick<Tables<'code_snippets'>, 'id' | 'topic_id' | 'title' | 'language' | 'passed' | 'last_output'>

export type TollboothQuestion = Exclude<StoredCheckQuestion, { type: 'short' }> & {
  /** Where the prompt came from: saved question, FSRS card, open mistake, coding debug challenge, or mental maths. */
  origin: 'question' | 'flashcard' | 'mistake' | 'coding' | 'builtin'
  topicId: string | null
}

export interface TollboothAnswer {
  question: TollboothQuestion
  /** The chosen option's index or the typed number; '' when the time ran out. */
  given: string
  right: boolean
  timeMs: number
}

interface CodingDebugSpec {
  id: string
  language: 'python' | 'javascript' | 'typescript' | 'sql'
  prompt: string
  answer: string
  distractors: [string, string, string]
  explanation: string
}

const CODING_DEBUG_PROMPTS: CodingDebugSpec[] = [
  {
    id: 'py-mutable-default',
    language: 'python',
    prompt: 'Debug Python: `def add_item(x, items=[]): items.append(x); return items`. Calling it twice shares `items`. Why?',
    answer: 'Default list arguments are evaluated once at function definition, not per call',
    distractors: [
      'Python lists cannot be returned from two different functions',
      'append() mutates global scope instead of local lists',
      'Return statements reuse cached objects only for numbers',
    ],
    explanation: 'Use `items=None` and create `items = []` inside the function body.',
  },
  {
    id: 'py-off-by-one',
    language: 'python',
    prompt: 'Debug Python: Why does `for i in range(1, len(arr))` miss one element when iterating an array?',
    answer: 'It skips index 0 because range starts at 1 instead of 0',
    distractors: [
      'len(arr) returns the last valid index instead of element count',
      'Python arrays are 1-indexed when passed to range()',
      'The loop always terminates two elements before the end',
    ],
    explanation: 'Python sequences are 0-indexed, so iterating all elements starts at `range(len(arr))`.',
  },
  {
    id: 'js-closure-var',
    language: 'javascript',
    prompt: 'Debug JS: `for (var i = 0; i < 3; i++) setTimeout(() => log(i), 0)` logs `3, 3, 3`. How do you fix it?',
    answer: 'Replace var with let so each loop iteration gets its own lexical binding',
    distractors: [
      'Replace setTimeout delay 0 with 1 so timers run synchronously',
      'Use === instead of < in the loop termination condition',
      'Freeze the array before scheduling any callback',
    ],
    explanation: '`var` is function-scoped while `let` creates a fresh binding per iteration.',
  },
  {
    id: 'ts-await-missing',
    language: 'typescript',
    prompt: 'Debug TS/JS: `const data = fetchJson()` logs `Promise { <pending> }` instead of parsed fields. What is missing?',
    answer: 'An await keyword (or .then handler) to unwrap the async Promise result',
    distractors: [
      'Adding JSON.stringify() around the async function call',
      'Marking fetchJson() with the static keyword',
      'Returning void from the caller function',
    ],
    explanation: 'Async functions return a Promise; you must `await` or chain `.then()` to access resolved data.',
  },
  {
    id: 'sql-null-eq',
    language: 'sql',
    prompt: 'Debug SQL: `SELECT * FROM tasks WHERE completed_at = NULL` returns 0 rows even with NULLs. Fix it:',
    answer: 'Use `completed_at IS NULL` because NULL is never equal with `=`',
    distractors: [
      'Replace single `=` with `==` for three-valued logic comparisons',
      'Wrap NULL in quotes (`\'NULL\'`) so SQL matches empty dates',
      'Move the filter from WHERE into ORDER BY',
    ],
    explanation: 'In SQL three-valued logic, `x = NULL` evaluates to UNKNOWN, not TRUE; use `IS NULL`.',
  },
  {
    id: 'sql-group-where',
    language: 'sql',
    prompt: 'Debug SQL: `SELECT user_id, COUNT(*) FROM logs WHERE COUNT(*) > 5 GROUP BY user_id` fails. Why?',
    answer: 'Aggregate predicates like COUNT(*) must go in HAVING, not WHERE',
    distractors: [
      'COUNT(*) cannot be selected alongside user_id in SELECT',
      'GROUP BY must be placed before the FROM clause',
      'HAVING only works inside DELETE statements',
    ],
    explanation: 'WHERE filters rows before grouping; HAVING filters groups after aggregation.',
  },
]

/** A random number generator that gives the same numbers for the same seed (so a try can be checked in tests). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    const a = copy[index]
    const b = copy[other]
    if (a === undefined || b === undefined) continue
    copy[index] = b
    copy[other] = a
  }
  return copy
}

const randomInt = (random: () => number, low: number, high: number) => low + Math.floor(random() * (high - low + 1))

/** Priority weight for an FSRS flashcard (0 when unused/unscheduled so non-FSRS pools shuffle evenly). */
export function cardWeaknessScore(card: Pick<Card, 'fsrs' | 'due_at'>, now: Date): number {
  const stats = mistakeFsrsStats(card.fsrs ?? {})
  const dueAtMs = card.due_at ? Date.parse(card.due_at) : Number.NaN
  const isDue = !Number.isNaN(dueAtMs) && dueAtMs <= now.getTime()
  const hasHistory = stats.lapses > 0 || stats.stability > 0 || stats.state !== CARD_STATE.new
  if (!isDue && !hasHistory) return 0

  let score = 0
  if (isDue) {
    const overdueHours = Math.max(0, (now.getTime() - dueAtMs) / 3_600_000)
    score += 50 + Math.min(36, overdueHours)
  }
  score += stats.lapses * 28
  if (stats.state === CARD_STATE.learning || stats.state === CARD_STATE.relearning) score += 20
  if (stats.stability > 0 && stats.stability < 4) score += 16
  return score
}

/** A flashcard as a 4-choice question: its own answer and 3 other cards' answers. Null when it can't be one. */
export function cardQuestion(card: Pick<Card, 'id' | 'front' | 'back' | 'topic_id'>, answers: string[], random: () => number): TollboothQuestion | null {
  const right = card.back.trim()
  if (!card.front.trim() || !right || right.length > MAX_CHOICE_LENGTH) return null
  const seen = new Set([right.toLowerCase()])
  const wrong: string[] = []
  for (let tries = 0; tries < 40 && wrong.length < 3 && answers.length > 0; tries++) {
    const text = answers[Math.floor(random() * answers.length)]?.trim() ?? ''
    if (!text || text.length > MAX_CHOICE_LENGTH || seen.has(text.toLowerCase())) continue
    seen.add(text.toLowerCase())
    wrong.push(text)
  }
  if (wrong.length < 3) return null
  const options = shuffle([right, ...wrong], random)
  return { origin: 'flashcard', id: card.id, topicId: card.topic_id, type: 'mcq', prompt: card.front.trim(), options, correct: options.indexOf(right), explanation: '', difficulty: null }
}

/** An open mistake converted to a 4-choice question when its correct approach is concise enough to scan. */
export function mistakeQuestion(mistake: MistakeSummary, answers: string[], random: () => number): TollboothQuestion | null {
  const right = mistake.correct_approach?.trim() ?? ''
  const concept = mistake.concept.trim()
  if (!concept || !right || right.length > MAX_CHOICE_LENGTH) return null
  const seen = new Set([right.toLowerCase()])
  const wrong: string[] = []
  for (let tries = 0; tries < 40 && wrong.length < 3 && answers.length > 0; tries++) {
    const text = answers[Math.floor(random() * answers.length)]?.trim() ?? ''
    if (!text || text.length > MAX_CHOICE_LENGTH || seen.has(text.toLowerCase())) continue
    seen.add(text.toLowerCase())
    wrong.push(text)
  }
  if (wrong.length < 3) return null
  const options = shuffle([right, ...wrong], random)
  return {
    origin: 'mistake',
    id: mistake.id,
    topicId: mistake.topic_id,
    type: 'mcq',
    prompt: concept,
    options,
    correct: options.indexOf(right),
    explanation: mistake.why_wrong?.trim() ?? '',
    difficulty: null,
  }
}

/** Coding debugging challenge (matched to failed/active language when supplied). */
export function codingDebugQuestion(
  random: () => number,
  index: number,
  preferredLanguage?: string | null,
  snippet?: SnippetSummary,
): TollboothQuestion {
  const matching = preferredLanguage
    ? CODING_DEBUG_PROMPTS.filter((item) => item.language === preferredLanguage)
    : CODING_DEBUG_PROMPTS
  const candidates = matching.length > 0 ? matching : CODING_DEBUG_PROMPTS
  const spec = candidates[Math.floor(random() * candidates.length)] ?? CODING_DEBUG_PROMPTS[0]!
  const options = shuffle([spec.answer, ...spec.distractors], random)
  const prefix = snippet && snippet.passed === false ? `[Fix "${snippet.title}"] ` : ''
  return {
    origin: 'coding',
    id: `${spec.id}-${index}`,
    topicId: snippet?.topic_id ?? null,
    type: 'mcq',
    prompt: `${prefix}${spec.prompt}`,
    options,
    correct: options.indexOf(spec.answer),
    explanation: spec.explanation,
    difficulty: 2,
  }
}

/** Quick mental maths with 4 close choices: always clearly right or wrong, and different for every seed. */
export function builtinQuestion(random: () => number, index: number): TollboothQuestion {
  const kind = randomInt(random, 0, 3)
  let prompt: string
  let answer: number
  let explanation: string
  if (kind === 0) {
    const a = randomInt(random, 12, 29)
    const b = randomInt(random, 3, 9)
    answer = a * b
    prompt = `${a} × ${b} = ?`
    explanation = `${a} × ${b} = ${answer}`
  } else if (kind === 1) {
    const percent = [10, 15, 20, 25, 30, 40][randomInt(random, 0, 5)] ?? 10
    const base = randomInt(random, 4, 30) * 20
    answer = (percent * base) / 100
    prompt = `${percent}% of ${base} = ?`
    explanation = `${base} × ${percent} ÷ 100 = ${answer}`
  } else if (kind === 2) {
    const x = randomInt(random, 2, 12)
    const a = randomInt(random, 2, 9)
    const b = randomInt(random, 1, 30)
    answer = x
    prompt = `${a}x + ${b} = ${a * x + b}. What is x?`
    explanation = `${a}x = ${a * x}, so x = ${x}`
  } else {
    const start = randomInt(random, 2, 5)
    const ratio = randomInt(random, 2, 3)
    answer = start * ratio ** 4
    prompt = `What comes next: ${[0, 1, 2, 3].map((step) => start * ratio ** step).join(', ')}, …?`
    explanation = `Each number is ${ratio} times the one before: ${answer}.`
  }
  const wrong = shuffle([1, -1, 2, -2, 3, -3, 10, -10], random)
    .map((delta) => answer + delta)
    .filter((value) => value > 0)
    .slice(0, 3)
  const options = shuffle([answer, ...wrong], random).map(String)
  return { origin: 'builtin', id: `builtin-${index}`, topicId: null, type: 'mcq', prompt, options, correct: options.indexOf(String(answer)), explanation, difficulty: 1 }
}

export interface TollboothPool {
  questions: Question[]
  cards: Card[]
  topics: Topic[]
  mistakes?: MistakeSummary[]
  snippets?: SnippetSummary[]
}

/**
 * Picks up to `count` questions for a Tollbooth attempt:
 * 1) High-priority items first: open FSRS mistakes, due/weak/lapsed FSRS flashcards,
 *    and coding debugging prompts for recent/failing Coding Lab snippets.
 * 2) Remaining checkable MCQs, numericals, and flashcards in the active subject.
 * 3) Coding debug / mental maths fallback if there still aren't enough.
 */
export function pickQuestions(
  pool: TollboothPool,
  subjectId: string | null,
  seed: number,
  count = 3,
  now = new Date(),
): TollboothQuestion[] {
  const random = seededRandom(seed)
  const subjectOf = new Map(pool.topics.map((topic) => [topic.id, topic.subject_id]))
  const inSubject = (subject: string | null | undefined) => subjectId === null || subject === subjectId

  const openMistakes = (pool.mistakes ?? []).filter(
    (m) => m.status === 'open' && (subjectId === null || (m.topic_id !== null && inSubject(subjectOf.get(m.topic_id)))),
  )
  const mistakeQuestionBoost = new Map<string, number>()
  const mistakeCardBoost = new Map<string, number>()
  for (const m of openMistakes) {
    const score = 100 + mistakeWeaknessScore(m, now)
    if (m.question_id) mistakeQuestionBoost.set(m.question_id, Math.max(mistakeQuestionBoost.get(m.question_id) ?? 0, score))
    if (m.flashcard_id) mistakeCardBoost.set(m.flashcard_id, Math.max(mistakeCardBoost.get(m.flashcard_id) ?? 0, score))
  }

  const own = pool.questions.filter((row) => inSubject(row.subject_id) && (row.type === 'mcq' || row.type === 'numerical'))
  const usable = pool.cards.filter((card) => !card.suspended)
  const subjectCards = usable.filter((card) => card.topic_id !== null && inSubject(subjectOf.get(card.topic_id)))

  const distractorSource = [
    ...(subjectCards.length >= 4 ? subjectCards : usable).map((card) => card.back),
    ...openMistakes.flatMap((m) => (m.correct_approach ? [m.correct_approach] : [])),
  ]

  type RankedCandidate = { priority: number; tie: number; build: () => TollboothQuestion | null }
  const ranked: RankedCandidate[] = []

  const relevantSnippets = (pool.snippets ?? []).filter(
    (s) => subjectId === null || (s.topic_id !== null && inSubject(subjectOf.get(s.topic_id))) || s.passed === false,
  )
  const failingSnippet = relevantSnippets.find((s) => s.passed === false)
  if (failingSnippet) {
    ranked.push({
      priority: 120,
      tie: random(),
      build: () => codingDebugQuestion(random, 0, failingSnippet.language, failingSnippet),
    })
  } else if (relevantSnippets.length > 0) {
    const latest = relevantSnippets[0]!
    ranked.push({
      priority: 30,
      tie: random(),
      build: () => codingDebugQuestion(random, 0, latest.language, latest),
    })
  }

  for (const m of openMistakes) {
    // Only add standalone mistake candidate if it is not already covered by a linked question/card candidate in scope.
    const coveredByQuestion = Boolean(m.question_id && own.some((q) => q.id === m.question_id))
    const coveredByCard = Boolean(m.flashcard_id && subjectCards.some((c) => c.id === m.flashcard_id))
    if (!coveredByQuestion && !coveredByCard) {
      ranked.push({
        priority: 110 + mistakeWeaknessScore(m, now),
        tie: random(),
        build: () => mistakeQuestion(m, distractorSource, random),
      })
    }
  }

  for (const row of own) {
    ranked.push({
      priority: mistakeQuestionBoost.get(row.id) ?? 0,
      tie: random(),
      build: () => {
        const question = readCheckQuestion(row)
        return question && question.type !== 'short' ? { ...question, origin: 'question', topicId: row.topic_id } : null
      },
    })
  }

  for (const card of subjectCards) {
    const score = cardWeaknessScore(card, now) + (mistakeCardBoost.get(card.id) ?? 0)
    ranked.push({
      priority: score,
      tie: random(),
      build: () => cardQuestion(card, distractorSource, random),
    })
  }

  // Sort high-priority items first; items with equal priority keep their seeded random order.
  ranked.sort((a, b) => (b.priority !== a.priority ? b.priority - a.priority : a.tie - b.tie))

  const picked: TollboothQuestion[] = []
  for (const candidate of ranked) {
    if (picked.length === count) break
    const question = candidate.build()
    if (question) picked.push(question)
  }
  while (picked.length < count) {
    if (relevantSnippets.length > 0 && picked.filter((q) => q.origin === 'coding').length === 0) {
      const snippet = failingSnippet ?? relevantSnippets[0]
      picked.push(codingDebugQuestion(random, picked.length, snippet?.language, snippet))
    } else {
      picked.push(builtinQuestion(random, picked.length))
    }
  }
  return picked
}

export interface TollboothStatus {
  /** Emergency unlocks used and left today. */
  used: number
  left: number
  /** Seconds to wait after a wrong try (0 = a try can start). */
  wait: number
}

export function tollboothStatus(events: Pick<DistractionEvent, 'kind' | 'at'>[], { dayStart, now, dailyLimit }: { dayStart: Date; now: Date; dailyLimit: number }): TollboothStatus {
  const today = events.filter((event) => Date.parse(event.at) >= dayStart.getTime())
  const used = today.filter((event) => event.kind === 'tollbooth_unlock').length
  const lastFailed = Math.max(0, ...today.filter((event) => event.kind === 'tollbooth_failed').map((event) => Date.parse(event.at)))
  const wait = lastFailed > 0 ? Math.max(0, Math.ceil((lastFailed + COOLDOWN_SECONDS * 1000 - now.getTime()) / 1000)) : 0
  return { used, left: Math.max(0, dailyLimit - used), wait }
}

/** The notebook entry for a missed Tollbooth question, linked to its question or flashcard. */
export function tollboothMistake({ question, given }: Pick<TollboothAnswer, 'question' | 'given'>): TablesInsert<'mistakes'> {
  return {
    concept: question.prompt.slice(0, 1000),
    why_wrong: given === '' ? 'Academic Tollbooth: the time ran out.' : `Academic Tollbooth: I answered ${givenText(question, given)}`,
    correct_approach: [rightAnswerText(question), question.explanation].filter(Boolean).join('\n\n'),
    topic_id: question.topicId,
    question_id: question.origin === 'question' ? question.id : null,
    flashcard_id: question.origin === 'flashcard' ? question.id : null,
  }
}

export interface TollboothTry {
  subjectId: string | null
  sessionId: string | null
  /** The blocked app it was for (Android), if known. */
  appPackage: string | null
  questions: TollboothQuestion[]
  answers: TollboothAnswer[]
  /** Why the student needs the app (asked after all answers were right); null when the try failed. */
  reason: string | null
  unlockMinutes: number
  startedAt: Date
  now?: Date
}

/**
 * Saves a try: the tollbooth quiz, an attempt for each saved question answered, and the unlock
 * (or the failed try) as a distraction event. Returns when blocked apps are open until (null = failed).
 */
export async function saveTollbooth(source: DataSource, attempt: TollboothTry): Promise<string | null> {
  const now = attempt.now ?? new Date()
  const right = attempt.answers.filter((answer) => answer.right).length
  const reason = attempt.reason?.trim() ?? ''
  const passed = attempt.questions.length > 0 && right === attempt.questions.length && reason.length > 0
  const quizId = crypto.randomUUID()
  const quiz: TablesInsert<'quizzes'> = {
    id: quizId,
    kind: 'tollbooth',
    subject_id: attempt.subjectId,
    topic_ids: [...new Set(attempt.questions.flatMap((question) => (question.topicId ? [question.topicId] : [])))],
    time_limit_sec: SECONDS_PER_QUESTION * Math.max(1, attempt.questions.length),
    started_at: attempt.startedAt.toISOString(),
    finished_at: now.toISOString(),
    score: attempt.questions.length > 0 ? Math.round((right / attempt.questions.length) * 10_000) / 10_000 : 0,
  }
  const attempts: TablesInsert<'attempts'>[] = attempt.answers
    .filter((answer) => answer.question.origin === 'question')
    .map((answer) => ({
      question_id: answer.question.id,
      quiz_id: quizId,
      answer: { given: answer.given },
      is_correct: answer.right,
      score: answer.right ? 1 : 0,
      time_ms: Math.max(0, Math.round(answer.timeMs)),
    }))
  const unlockUntil = passed ? new Date(now.getTime() + attempt.unlockMinutes * 60_000).toISOString() : null
  const event: TablesInsert<'distraction_events'> = {
    kind: passed ? 'tollbooth_unlock' : 'tollbooth_failed',
    focus_session_id: attempt.sessionId,
    quiz_id: quizId,
    app_package: attempt.appPackage,
    reason: passed ? reason.slice(0, 300) : null,
    unlock_until: unlockUntil,
    at: now.toISOString(),
  }

  if (source.kind === 'demo') {
    demoDb.insert('quizzes', [quiz])
    if (attempts.length > 0) demoDb.insert('attempts', attempts)
    demoDb.insert('distraction_events', [event])
    return unlockUntil
  }
  const { client } = source
  const savedQuiz = await client.from('quizzes').insert(quiz)
  if (savedQuiz.error) throw dbError(savedQuiz.error)
  if (attempts.length > 0) {
    const savedAttempts = await client.from('attempts').insert(attempts)
    if (savedAttempts.error) throw dbError(savedAttempts.error)
  }
  const savedEvent = await client.from('distraction_events').insert(event)
  if (savedEvent.error) throw dbError(savedEvent.error)
  return unlockUntil
}

/** Questions, FSRS cards, topics, open mistakes, and recent coding snippets for Tollbooth selection. */
export async function loadTollboothPool(source: DataSource): Promise<TollboothPool> {
  if (source.kind === 'demo') {
    return {
      questions: demoDb.list('questions'),
      cards: demoDb.list('flashcards'),
      topics: demoDb.list('topics'),
      mistakes: demoDb.list('mistakes').filter((m) => m.status === 'open'),
      snippets: demoDb.list('code_snippets'),
    }
  }
  const { client, userId } = source
  const [questions, cards, topics, mistakes, snippets] = await Promise.all([
    client.from('questions').select('*').eq('user_id', userId).in('type', ['mcq', 'numerical']).limit(1000),
    client.from('flashcards').select('id, front, back, topic_id, suspended, fsrs, due_at').eq('user_id', userId).limit(2000),
    client.from('topics').select('id, subject_id').eq('user_id', userId),
    client
      .from('mistakes')
      .select('id, topic_id, question_id, flashcard_id, concept, why_wrong, correct_approach, status, fsrs, next_review_at, correct_count')
      .eq('user_id', userId)
      .eq('status', 'open')
      .limit(500),
    client
      .from('code_snippets')
      .select('id, topic_id, title, language, passed, last_output')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(50),
  ])
  const error = questions.error ?? cards.error ?? topics.error ?? mistakes.error ?? snippets.error
  if (error) throw dbError(error)
  return {
    questions: questions.data ?? [],
    cards: cards.data ?? [],
    topics: topics.data ?? [],
    mistakes: mistakes.data ?? [],
    snippets: snippets.data ?? [],
  }
}

export function useTollboothPool() {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'tollbooth-pool'],
    queryFn: () => loadTollboothPool(need(source)),
    enabled: source !== null,
  })
}

/** Saves a try. Afterwards the day's unlocks (distraction events) and Academics (attempts) reload. */
export function useSaveTollbooth() {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (attempt: TollboothTry) => saveTollbooth(need(source), attempt),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: distractionsKey(owner) }), queryClient.invalidateQueries({ queryKey: academicsKey(owner) })])
    },
  })
}
