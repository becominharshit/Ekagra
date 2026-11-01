import { describe, expect, it } from 'vitest'
import { GeneratedTopicSchema } from '@shared/schemas.ts'
import { loadStudy } from '@/features/academics/roadmap'
import { addSampleSubjects } from '@/features/academics/sampleSubjects'
import { demoTopic } from '@/features/ai/demoAi'
import { listCards } from '@/features/flashcards/flashcards'
import { listMistakes } from '@/features/mistakes/mistakes'
import { toPlannerStudy } from '@/features/planner/studyData'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { generateRequest, generateTopic, loadTopicStudy, saveCheckQuiz, type QuizAnswer, type TopicStudy } from './lessons'
import { isRight } from './quiz'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const LEARNER = { program: 'B.Tech CSE', year: 2 }

/** The sample DBMS subject's "SQL queries" topic, studied in Demo Mode. */
async function sqlTopic(): Promise<TopicStudy> {
  await addSampleSubjects(DEMO, '2026-11-02')
  const topic = demoDb.list('topics').find((row) => row.title === 'SQL queries')
  const study = topic ? await loadTopicStudy(DEMO, topic.id) : null
  if (!study) throw new Error('no SQL topic')
  return study
}

async function reload(study: TopicStudy): Promise<TopicStudy> {
  const fresh = await loadTopicStudy(DEMO, study.topic.id)
  if (!fresh) throw new Error('topic gone')
  return fresh
}

/** Answers every question: right, or (for the given indexes) wrong. */
function answer(study: TopicStudy, wrong: number[] = []): QuizAnswer[] {
  return study.checkQuestions.map((question, index) => {
    const right = !wrong.includes(index)
    let given = 'my answer'
    if (question.type === 'mcq') given = String(right ? question.correct : (question.correct + 1) % question.options.length)
    if (question.type === 'numerical') given = String(right ? question.value : question.value + 5)
    return { question, given, right: question.type === 'short' ? right : isRight(question, given), timeMs: 4000 }
  })
}

describe('the topic loop in Demo Mode: lesson → check quiz → flashcards → mistakes', () => {
  it('knows the topic: its unit, what comes before it and how it was asked', async () => {
    const study = await sqlTopic()
    expect(study).toMatchObject({ unit: { title: 'Unit 2: SQL and transactions' }, prerequisites: ['Relational algebra'], lesson: null, checkQuestions: [] })
    expect(study.pastQuestions.map((question) => question.prompt)).toEqual(['Write a SQL query using GROUP BY and HAVING.', 'Explain inner, left and full outer joins.'])
    expect(generateRequest(study, LEARNER)).toMatchObject({
      subjectName: 'Database Management Systems',
      topicTitle: 'SQL queries',
      track: 'exam',
      prerequisites: ['Relational algebra'],
      pastQuestions: [{ text: 'Write a SQL query using GROUP BY and HAVING.', marks: 10, year: 2024 }, expect.anything()],
      program: 'B.Tech CSE',
    })
  })

  it("makes a sample that fits the AI's answer format", async () => {
    const study = await sqlTopic()
    const sample = demoTopic(generateRequest(study, LEARNER), { otherUnits: study.otherUnits, otherTopics: study.otherTopics, pyqCount: 2, marksShare: 0.3 })
    expect(GeneratedTopicSchema.safeParse(sample).success).toBe(true)
    expect(sample.lessonMd).toContain('Demo Mode has no AI')
    expect(sample.checkQuestions.map((question) => question.type)).toEqual(['mcq', 'mcq', 'mcq', 'numerical', 'short'])
  })

  it('saves the lesson, check questions and flashcards once, and the topic is now being learned', async () => {
    let study = await sqlTopic()
    await generateTopic(DEMO, { study, learner: LEARNER })
    study = await reload(study)
    expect(study.lesson?.content_md).toContain('SQL queries')
    expect(study.checkQuestions).toHaveLength(5)
    expect(study.generatedCardCount).toBeGreaterThanOrEqual(5)
    expect(study.topic.status).toBe('learning')

    // Regenerating replaces the lesson and the questions, but keeps the flashcards (no duplicates).
    const cardsBefore = study.cardCount
    const oldIds = study.checkQuestionIds
    await generateTopic(DEMO, { study, learner: LEARNER })
    study = await reload(study)
    expect(demoDb.list('lessons')).toHaveLength(1)
    expect(study.checkQuestions).toHaveLength(5)
    expect(study.checkQuestionIds.some((id) => oldIds.includes(id))).toBe(false)
    expect(study.cardCount).toBe(cardsBefore)
  })

  it('saves a quiz with its attempts, puts wrong answers in the notebook, and keeps the topic in the plan below 80%', async () => {
    let study = await sqlTopic()
    await generateTopic(DEMO, { study, learner: LEARNER })
    study = await reload(study)

    const score = await saveCheckQuiz(DEMO, { study, answers: answer(study, [0, 3]), startedAt: new Date(Date.now() - 60_000) })
    expect(score).toBe(0.6)
    expect(demoDb.list('quizzes')).toEqual([expect.objectContaining({ kind: 'check', score: 0.6, topic_ids: [study.topic.id] })])
    expect(demoDb.list('attempts')).toHaveLength(5)
    const mistakes = await listMistakes(DEMO)
    expect(mistakes).toHaveLength(2)
    expect(mistakes.every((mistake) => mistake.topic_id === study.topic.id && mistake.question_id !== null && mistake.why_wrong?.startsWith('I answered'))).toBe(true)

    study = await reload(study)
    expect(study.topic).toMatchObject({ status: 'learning', mastery: 0.6 })
    expect(study.lastQuiz?.score).toBe(0.6)
  })

  it('counts the topic as learned from 80%, so the planner moves on', async () => {
    let study = await sqlTopic()
    await generateTopic(DEMO, { study, learner: LEARNER })
    study = await reload(study)
    await saveCheckQuiz(DEMO, { study, answers: answer(study), startedAt: new Date() })

    study = await reload(study)
    expect(study.topic).toMatchObject({ status: 'review', mastery: 1 })
    const all = await loadStudy(DEMO)
    const planned = toPlannerStudy(all.subjects, all.topics, all.prereqs).topics.map((topic) => topic.title)
    expect(planned).not.toContain('SQL queries')
    expect(planned).toContain('Transactions and concurrency')
    expect((await listCards(DEMO)).filter((card) => card.topic_id === study.topic.id).length).toBeGreaterThanOrEqual(5)
  })
})
