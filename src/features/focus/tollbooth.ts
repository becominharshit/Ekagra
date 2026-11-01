import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { academicsKey } from '@/features/academics/subjects'
import { givenText, readCheckQuestion, rightAnswerText, type StoredCheckQuestion } from '@/features/lessons/quiz'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Tables, TablesInsert } from '@/types/database'
import { distractionsKey, type DistractionEvent } from './distractions'

// The Academic Tollbooth: to open a blocked app during focus (an emergency unlock), answer 3
// rapid-fire questions from the subject you're studying, then say why. All right: blocked apps
// open for a few minutes (a tollbooth_unlock event). One wrong: they stay blocked
// (tollbooth_failed) and the missed concept can go into the Mistake Notebook. A few a day at most.
// Questions come from the subject's MCQs and numericals, its flashcards (as 4-choice questions
// whose wrong choices are other cards' answers) or, when there aren't enough, built-in mental maths.

export const SECONDS_PER_QUESTION = 20
/** After a wrong try, the next one can start after this many seconds. */
export const COOLDOWN_SECONDS = 60
/** Answers longer than this can't be read as a choice in 20 seconds. */
const MAX_CHOICE_LENGTH = 140

type Question = Tables<'questions'>
type Card = Pick<Tables<'flashcards'>, 'id' | 'front' | 'back' | 'topic_id' | 'suspended'>
type Topic = Pick<Tables<'topics'>, 'id' | 'subject_id'>

export type TollboothQuestion = Exclude<StoredCheckQuestion, { type: 'short' }> & {
  /** A saved question (its attempt is saved), a flashcard, or a built-in question. */
  origin: 'question' | 'flashcard' | 'builtin'
  topicId: string | null
}

export interface TollboothAnswer {
  question: TollboothQuestion
  /** The chosen option's index or the typed number; '' when the time ran out. */
  given: string
  right: boolean
  timeMs: number
}

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
}

/**
 * The questions for one try: the subject's own questions and flashcards in a random mix, then
 * built-in ones when there aren't enough. Without a subject, every subject's count.
 */
export function pickQuestions(pool: TollboothPool, subjectId: string | null, seed: number, count = 3): TollboothQuestion[] {
  const random = seededRandom(seed)
  const subjectOf = new Map(pool.topics.map((topic) => [topic.id, topic.subject_id]))
  const inSubject = (subject: string | null | undefined) => subjectId === null || subject === subjectId
  const own = pool.questions.filter((row) => inSubject(row.subject_id) && (row.type === 'mcq' || row.type === 'numerical'))
  const usable = pool.cards.filter((card) => !card.suspended)
  const subjectCards = usable.filter((card) => card.topic_id !== null && inSubject(subjectOf.get(card.topic_id)))
  // Wrong choices come from the subject's own cards when there are enough, else from all cards.
  const answers = (subjectCards.length >= 4 ? subjectCards : usable).map((card) => card.back)

  const candidates = shuffle([...own.map((row) => ({ row, card: null })), ...subjectCards.map((card) => ({ row: null, card }))], random)
  const picked: TollboothQuestion[] = []
  for (const { row, card } of candidates) {
    if (picked.length === count) break
    if (row) {
      const question = readCheckQuestion(row)
      if (question && question.type !== 'short') picked.push({ ...question, origin: 'question', topicId: row.topic_id })
    } else if (card) {
      const question = cardQuestion(card, answers, random)
      if (question) picked.push(question)
    }
  }
  while (picked.length < count) picked.push(builtinQuestion(random, picked.length))
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

/** Every question and flashcard the Tollbooth can ask from, and which subject each topic is in. */
export async function loadTollboothPool(source: DataSource): Promise<TollboothPool> {
  if (source.kind === 'demo') return { questions: demoDb.list('questions'), cards: demoDb.list('flashcards'), topics: demoDb.list('topics') }
  const { client, userId } = source
  const [questions, cards, topics] = await Promise.all([
    client.from('questions').select('*').eq('user_id', userId).in('type', ['mcq', 'numerical']).limit(1000),
    client.from('flashcards').select('id, front, back, topic_id, suspended').eq('user_id', userId).limit(2000),
    client.from('topics').select('id, subject_id').eq('user_id', userId),
  ])
  const error = questions.error ?? cards.error ?? topics.error
  if (error) throw dbError(error)
  return { questions: questions.data ?? [], cards: cards.data ?? [], topics: topics.data ?? [] }
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
