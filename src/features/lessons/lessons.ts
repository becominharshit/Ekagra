import { useQuery } from '@tanstack/react-query'
import { GenerateResponseSchema, type GenerateRequest, type GenerateResponse } from '@shared/schemas.ts'
import type { Question } from '@/features/academics/pastPapers'
import { loadPaperQuestions, loadRoadmap } from '@/features/academics/roadmap'
import { academicsKey, listSubjects, type Subject } from '@/features/academics/subjects'
import type { Topic } from '@/features/academics/topicTree'
import { callAiFunction } from '@/features/ai/aiClient'
import { demoTopic } from '@/features/ai/demoAi'
import { noteMistake } from '@/features/mistakes/mistakes'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'
import { checkQuestionRows, isCheckQuestion, mistakeForAnswer, readCheckQuestion, topicAfterQuiz, type StoredCheckQuestion } from './quiz'

// Studying one topic: its lesson, check quiz and flashcards are made once, when the student
// gets to the topic (lazy), and saved in Supabase or (Demo Mode) on the device.

export type Lesson = Tables<'lessons'>
export type Quiz = Tables<'quizzes'>

export interface TopicStudy {
  topic: Topic
  subject: Subject
  unit: Topic | null
  /** Titles of the topics to learn first. */
  prerequisites: string[]
  /** Past-paper questions matched to this topic. */
  pastQuestions: Question[]
  /** The subject's other units and topics (Demo Mode builds its sample questions from them). */
  otherUnits: string[]
  otherTopics: string[]
  lesson: Lesson | null
  checkQuestions: StoredCheckQuestion[]
  /** Ids of the saved check questions (also broken ones), so a new quiz replaces all of them. */
  checkQuestionIds: string[]
  cardCount: number
  generatedCardCount: number
  lastQuiz: Quiz | null
}

const byStart = (a: Quiz, b: Quiz) => Date.parse(b.started_at) - Date.parse(a.started_at)

async function topicRow(source: DataSource, topicId: string): Promise<Topic | null> {
  if (source.kind === 'demo') return demoDb.get('topics', topicId)
  const { data, error } = await source.client.from('topics').select('*').eq('user_id', source.userId).eq('id', topicId).maybeSingle()
  if (error) throw dbError(error)
  return data
}

/** The topic's own rows: lesson, generated questions, flashcards and check quizzes. */
async function topicRows(source: DataSource, topicId: string): Promise<{ lesson: Lesson | null; questions: Question[]; cards: Pick<Tables<'flashcards'>, 'source'>[]; quizzes: Quiz[] }> {
  if (source.kind === 'demo') {
    return {
      lesson: demoDb.list('lessons').find((lesson) => lesson.topic_id === topicId) ?? null,
      questions: demoDb.list('questions').filter((question) => question.topic_id === topicId && question.source === 'generated'),
      cards: demoDb.list('flashcards').filter((card) => card.topic_id === topicId),
      quizzes: demoDb.list('quizzes').filter((quiz) => quiz.kind === 'check' && quiz.topic_ids.includes(topicId)),
    }
  }
  const client = source.client
  const [lesson, questions, cards, quizzes] = await Promise.all([
    client.from('lessons').select('*').eq('user_id', source.userId).eq('topic_id', topicId).maybeSingle(),
    client.from('questions').select('*').eq('user_id', source.userId).eq('topic_id', topicId).eq('source', 'generated'),
    client.from('flashcards').select('source').eq('user_id', source.userId).eq('topic_id', topicId),
    client.from('quizzes').select('*').eq('user_id', source.userId).eq('kind', 'check').contains('topic_ids', [topicId]).order('started_at', { ascending: false }).limit(1),
  ])
  for (const result of [lesson, questions, cards, quizzes]) if (result.error) throw dbError(result.error)
  return { lesson: lesson.data, questions: questions.data ?? [], cards: cards.data ?? [], quizzes: quizzes.data ?? [] }
}

export async function loadTopicStudy(source: DataSource, topicId: string): Promise<TopicStudy | null> {
  const topic = await topicRow(source, topicId)
  if (!topic || topic.parent_id === null) return null
  const [subjects, roadmap, paperQuestions, rows] = await Promise.all([
    listSubjects(source),
    loadRoadmap(source, topic.subject_id),
    loadPaperQuestions(source, topic.subject_id),
    topicRows(source, topicId),
  ])
  const subject = subjects.find((candidate) => candidate.id === topic.subject_id)
  if (!subject) return null
  const titleOf = new Map(roadmap.topics.map((row) => [row.id, row.title]))
  const checkRows = rows.questions.filter(isCheckQuestion)
  return {
    topic,
    subject,
    unit: roadmap.topics.find((row) => row.id === topic.parent_id) ?? null,
    prerequisites: roadmap.prereqs.filter((link) => link.topic_id === topic.id).flatMap((link) => titleOf.get(link.prereq_topic_id) ?? []),
    pastQuestions: paperQuestions.filter((question) => question.topic_id === topic.id),
    otherUnits: roadmap.topics.filter((row) => row.parent_id === null && row.id !== topic.parent_id).map((row) => row.title),
    otherTopics: roadmap.topics.filter((row) => row.parent_id !== null && row.id !== topic.id).map((row) => row.title),
    lesson: rows.lesson,
    checkQuestions: checkRows.flatMap((row) => readCheckQuestion(row) ?? []),
    checkQuestionIds: checkRows.map((row) => row.id),
    cardCount: rows.cards.length,
    generatedCardCount: rows.cards.filter((card) => card.source === 'generated').length,
    lastQuiz: [...rows.quizzes].sort(byStart)[0] ?? null,
  }
}

export interface Learner {
  program: string | null
  year: number | null
  mentorTone?: 'strict' | 'balanced' | 'friendly'
}

/** What ai-generate gets: the topic, its place in the subject and how the exam asked it. */
export function generateRequest(study: TopicStudy, learner: Learner): GenerateRequest {
  return {
    subjectName: study.subject.name,
    unitTitle: study.unit?.title ?? null,
    topicTitle: study.topic.title,
    track: study.topic.track === 'skill' ? 'skill' : 'exam',
    difficulty: study.topic.difficulty,
    estMinutes: study.topic.est_minutes,
    prerequisites: study.prerequisites.slice(0, 10),
    pastQuestions: study.pastQuestions.slice(0, 8).map((question) => ({
      text: question.prompt.slice(0, 600),
      marks: question.marks === null ? null : Number(question.marks),
      year: question.year,
    })),
    program: learner.program,
    year: learner.year,
    mentorTone: learner.mentorTone,
  }
}

async function saveGenerated(source: DataSource, study: TopicStudy, answer: GenerateResponse): Promise<void> {
  const { topic } = study
  const lesson = { topic_id: topic.id, content_md: answer.lessonMd, sources: [], prompt_version: answer.promptVersion, model: answer.model }
  const questions = checkQuestionRows(answer.checkQuestions, topic, answer.promptVersion)
  // Regenerating keeps the flashcards already made for this topic (and their review history).
  const cards: TablesInsert<'flashcards'>[] =
    study.generatedCardCount > 0 ? [] : answer.flashcards.map((card) => ({ front: card.front, back: card.back, source: 'generated', topic_id: topic.id }))
  const topicPatch: TablesUpdate<'topics'> | null = topic.status === 'not_started' ? { status: 'learning' } : null

  if (source.kind === 'demo') {
    if (study.lesson) demoDb.update('lessons', study.lesson.id, lesson)
    else demoDb.insert('lessons', [lesson])
    demoDb.remove('questions', study.checkQuestionIds)
    demoDb.insert('questions', questions)
    demoDb.insert('flashcards', cards)
    if (topicPatch) demoDb.update('topics', topic.id, topicPatch)
    return
  }
  const client = source.client
  const saved = await client.from('lessons').upsert(lesson, { onConflict: 'topic_id' })
  if (saved.error) throw dbError(saved.error)
  if (study.checkQuestionIds.length > 0) {
    const removed = await client.from('questions').delete().in('id', study.checkQuestionIds)
    if (removed.error) throw dbError(removed.error)
  }
  const added = await client.from('questions').insert(questions)
  if (added.error) throw dbError(added.error)
  if (cards.length > 0) {
    const inserted = await client.from('flashcards').insert(cards)
    if (inserted.error) throw dbError(inserted.error)
  }
  if (topicPatch) {
    const updated = await client.from('topics').update(topicPatch).eq('id', topic.id)
    if (updated.error) throw dbError(updated.error)
  }
}

/** Makes (or remakes) the topic's lesson, check quiz and flashcards. Signed in: the AI; Demo Mode: a sample. */
export async function generateTopic(source: DataSource, { study, learner }: { study: TopicStudy; learner: Learner }): Promise<void> {
  const request = generateRequest(study, learner)
  const answer =
    source.kind === 'demo'
      ? demoTopic(request, { otherUnits: study.otherUnits, otherTopics: study.otherTopics, pyqCount: study.topic.pyq_count, marksShare: Number(study.topic.pyq_marks_share) })
      : await callAiFunction('ai-generate', request, GenerateResponseSchema)
  await saveGenerated(source, study, answer)
}

export interface QuizAnswer {
  question: StoredCheckQuestion
  /** mcq: the chosen option's index; numerical: the typed number; short: what the student wrote. */
  given: string
  right: boolean
  timeMs: number
}

/**
 * Saves a finished check quiz: the quiz, one attempt per question, a notebook entry for each wrong
 * answer, and the topic's new mastery and status. Returns the score (0–1).
 */
export async function saveCheckQuiz(
  source: DataSource,
  { study, answers, startedAt, now = new Date() }: { study: TopicStudy; answers: QuizAnswer[]; startedAt: Date; now?: Date },
): Promise<number> {
  const score = answers.length > 0 ? Math.round((answers.filter((answer) => answer.right).length / answers.length) * 10_000) / 10_000 : 0
  const quizId = crypto.randomUUID()
  const quiz: TablesInsert<'quizzes'> = {
    id: quizId,
    kind: 'check',
    subject_id: study.subject.id,
    topic_ids: [study.topic.id],
    started_at: startedAt.toISOString(),
    finished_at: now.toISOString(),
    score,
  }
  const attempts: TablesInsert<'attempts'>[] = answers.map((answer) => ({
    question_id: answer.question.id,
    quiz_id: quizId,
    answer: { given: answer.given },
    is_correct: answer.right,
    score: answer.right ? 1 : 0,
    time_ms: Math.max(0, Math.round(answer.timeMs)),
  }))
  const topicPatch = topicAfterQuiz(study.topic, score)

  if (source.kind === 'demo') {
    demoDb.insert('quizzes', [quiz])
    demoDb.insert('attempts', attempts)
    demoDb.update('topics', study.topic.id, topicPatch)
  } else {
    const client = source.client
    const savedQuiz = await client.from('quizzes').insert(quiz)
    if (savedQuiz.error) throw dbError(savedQuiz.error)
    const savedAttempts = await client.from('attempts').insert(attempts)
    if (savedAttempts.error) throw dbError(savedAttempts.error)
    const updated = await client.from('topics').update(topicPatch).eq('id', study.topic.id)
    if (updated.error) throw dbError(updated.error)
  }
  for (const answer of answers) {
    if (!answer.right) await noteMistake(source, mistakeForAnswer(answer.question, answer.given, study.topic.id), now)
  }
  return score
}

export function useTopicStudy(topicId: string | undefined) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'topic', topicId],
    queryFn: () => loadTopicStudy(need(source), topicId ?? ''),
    enabled: source !== null && Boolean(topicId),
  })
}
