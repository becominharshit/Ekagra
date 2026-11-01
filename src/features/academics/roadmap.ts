import { useQuery } from '@tanstack/react-query'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { TablesUpdate } from '@/types/database'
import { leafTopics, priorityChanges, type Question } from './pastPapers'
import { academicsKey, listSubjects, type Subject } from './subjects'
import { planSave, type DraftTree, type Roadmap, type SavePlan, type Topic, type TopicPrereq } from './topicTree'

// Roadmaps (topics and their prerequisites), saved in Supabase or (Demo Mode) on the device.

export async function loadRoadmap(source: DataSource, subjectId: string): Promise<Roadmap> {
  if (source.kind === 'demo') {
    const topics = demoDb.list('topics').filter((topic) => topic.subject_id === subjectId)
    const ids = new Set(topics.map((topic) => topic.id))
    return { topics, prereqs: demoDb.list('topic_prereqs').filter((link) => ids.has(link.topic_id)) }
  }
  const [topics, prereqs] = await Promise.all([
    source.client.from('topics').select('*').eq('user_id', source.userId).eq('subject_id', subjectId).order('order_index'),
    source.client.from('topic_prereqs').select('*').eq('user_id', source.userId),
  ])
  if (topics.error) throw dbError(topics.error)
  if (prereqs.error) throw dbError(prereqs.error)
  const ids = new Set(topics.data.map((topic) => topic.id))
  return { topics: topics.data, prereqs: prereqs.data.filter((link) => ids.has(link.topic_id)) }
}

/** The subject's past-paper questions (they decide the priorities). */
export async function loadPaperQuestions(source: DataSource, subjectId: string): Promise<Question[]> {
  if (source.kind === 'demo') {
    return demoDb.list('questions').filter((question) => question.subject_id === subjectId && question.source === 'pyq')
  }
  const { data, error } = await source.client
    .from('questions')
    .select('*')
    .eq('user_id', source.userId)
    .eq('subject_id', subjectId)
    .eq('source', 'pyq')
  if (error) throw dbError(error)
  return data
}

/** Saves changed values of topics. In Supabase this is one request (an upsert of the whole rows). */
async function updateTopics(source: DataSource, current: Topic[], changes: { id: string; patch: TablesUpdate<'topics'> }[]): Promise<void> {
  if (changes.length === 0) return
  if (source.kind === 'demo') {
    for (const change of changes) demoDb.update('topics', change.id, change.patch)
    return
  }
  const byId = new Map(current.map((topic) => [topic.id, topic]))
  const rows = changes.flatMap((change) => {
    const topic = byId.get(change.id)
    return topic ? [{ ...topic, ...change.patch }] : []
  })
  const { error } = await source.client.from('topics').upsert(rows)
  if (error) throw dbError(error)
}

async function applyPlan(source: DataSource, existing: Roadmap, plan: SavePlan): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.insert('topics', plan.insert)
    for (const change of plan.update) demoDb.update('topics', change.id, change.patch)
    demoDb.insert('topic_prereqs', plan.insertPrereqs)
    demoDb.remove('topic_prereqs', plan.removePrereqs)
    demoDb.remove('topics', plan.remove)
    return
  }
  const client = source.client
  // New rows first and old rows last, so a failure halfway never leaves the subject without topics.
  if (plan.insert.length > 0) {
    const { error } = await client.from('topics').insert(plan.insert)
    if (error) throw dbError(error)
  }
  await updateTopics(source, existing.topics, plan.update)
  if (plan.insertPrereqs.length > 0) {
    const { error } = await client.from('topic_prereqs').insert(plan.insertPrereqs)
    if (error) throw dbError(error)
  }
  if (plan.removePrereqs.length > 0) {
    const { error } = await client.from('topic_prereqs').delete().in('id', plan.removePrereqs)
    if (error) throw dbError(error)
  }
  if (plan.remove.length > 0) {
    const { error } = await client.from('topics').delete().in('id', plan.remove)
    if (error) throw dbError(error)
  }
}

/** Recomputes the past-paper numbers and priority of every topic in the subject. */
export async function refreshPriorities(source: DataSource, subjectId: string): Promise<void> {
  const [roadmap, questions] = await Promise.all([loadRoadmap(source, subjectId), loadPaperQuestions(source, subjectId)])
  await updateTopics(source, roadmap.topics, priorityChanges(roadmap, questions))
}

/** Saves an edited (or newly imported) roadmap, then updates the priorities. */
export async function saveRoadmap(source: DataSource, { subjectId, draft }: { subjectId: string; draft: DraftTree }): Promise<void> {
  const existing = await loadRoadmap(source, subjectId)
  await applyPlan(source, existing, planSave(subjectId, existing, draft))
  await refreshPriorities(source, subjectId)
}

export function useRoadmap(subjectId: string | undefined) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'roadmap', subjectId],
    queryFn: () => loadRoadmap(need(source), subjectId ?? ''),
    enabled: source !== null && Boolean(subjectId),
  })
}

export interface StudyData {
  subjects: Subject[]
  topics: Topic[]
  prereqs: TopicPrereq[]
}

/** Every subject with its topics: what the planner plans with. */
export async function loadStudy(source: DataSource): Promise<StudyData> {
  const subjects = await listSubjects(source)
  const subjectIds = new Set(subjects.map((subject) => subject.id))
  if (source.kind === 'demo') {
    const topics = demoDb.list('topics').filter((topic) => subjectIds.has(topic.subject_id))
    const ids = new Set(topics.map((topic) => topic.id))
    return { subjects, topics, prereqs: demoDb.list('topic_prereqs').filter((link) => ids.has(link.topic_id)) }
  }
  const [topics, prereqs] = await Promise.all([
    source.client.from('topics').select('*').eq('user_id', source.userId),
    source.client.from('topic_prereqs').select('*').eq('user_id', source.userId),
  ])
  if (topics.error) throw dbError(topics.error)
  if (prereqs.error) throw dbError(prereqs.error)
  return { subjects, topics: topics.data.filter((topic) => subjectIds.has(topic.subject_id)), prereqs: prereqs.data }
}

export function useStudy() {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'study'],
    queryFn: () => loadStudy(need(source)),
    enabled: source !== null,
  })
}

/** Every topic as a choice for a picker ("DBMS: SQL queries"), subject by subject in syllabus order. */
export function useTopicChoices(): { id: string; label: string }[] {
  const study = useStudy()
  return (study.data?.subjects ?? []).flatMap((subject) =>
    leafTopics(study.data?.topics.filter((topic) => topic.subject_id === subject.id) ?? []).map((topic) => ({
      id: topic.id,
      label: `${subject.code ?? subject.name}: ${topic.title}`,
    })),
  )
}
