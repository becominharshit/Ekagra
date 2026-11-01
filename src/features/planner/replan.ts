import { useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { loadStudy, useStudy } from '@/features/academics/roadmap'
import { listCards } from '@/features/flashcards/flashcards'
import { listMistakes } from '@/features/mistakes/mistakes'
import { toPlannerRoutine } from '@/features/onboarding/routineDraft'
import { profileRepoFor, useProfile, useRoutine } from '@/features/profile/queries'
import { plannerSettingsFor, readSettings, toChronotype } from '@/features/profile/settings'
import { useNow } from '@/hooks/useNow'
import { need, useDataSource, type DataSource } from '@/lib/dataSource'
import { latestPlanVersion, listBlocks, listWorkRows, planKey, PlanConflictError, savePlan } from './planBlocks'
import { buildPlan } from './planner'
import { reviewMinutesByDay } from './reviewLoad'
import { localDateOf, minuteOf, planFingerprint, planIsFresh, planRows, replanStart, workDone, type PlanRun } from './schedule'
import { toPlannerStudy } from './studyData'
import type { LocalDate } from './types'

// Making the plan: load what the planner needs, run it, save the blocks. It runs when the app
// opens with an old plan, when the planner's inputs change, after "I Crashed", after the evening
// check-in (for tomorrow) and when the student taps "Re-plan".

export type ReplanFrom = 'now' | 'tomorrow'

export interface ReplanResult {
  /** The first day this run planned. */
  plannedFrom: LocalDate
  version: number
  blockCount: number
}

/** Plans from now (after the block that is running), or from tomorrow morning. */
export async function replan(source: DataSource, { from, now = new Date() }: { from: ReplanFrom; now?: Date }): Promise<ReplanResult> {
  const today = localDateOf(now)
  const repo = profileRepoFor(source)
  const [profile, routine, study, cards, mistakes, todayBlocks, workRows, version] = await Promise.all([
    repo.getProfile(),
    repo.getRoutine(),
    loadStudy(source),
    listCards(source),
    listMistakes(source),
    listBlocks(source, today, today),
    listWorkRows(source),
    latestPlanVersion(source),
  ])
  if (!profile) throw new Error('Your profile is missing. Please finish setting up first.')

  const start = from === 'tomorrow' ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) : replanStart(todayBlocks, now)
  const planFrom = localDateOf(start)
  const settings = readSettings(profile.settings)
  const done = workDone(workRows, today)
  const plan = buildPlan({
    today: planFrom,
    nowMinute: planFrom === today ? minuteOf(start) : 0,
    horizonDays: 14,
    routine: toPlannerRoutine(routine),
    ...toPlannerStudy(study.subjects, study.topics, study.prereqs, done.byTopic),
    tasks: [],
    reviewMinutes: reviewMinutesByDay({ cards, mistakes, today: planFrom, days: 14, newCardsPerDay: settings.learning.newCardsPerDay }),
    checkIns: [],
    doneTodayBySubject: planFrom === today ? Object.fromEntries(done.todayBySubject) : undefined,
    settings: plannerSettingsFor(settings, toChronotype(profile.chronotype)),
  })
  const rows = planRows(plan, version + 1).filter((row) => Date.parse(row.start_at) >= start.getTime())
  await savePlan(source, { rows, replaceFrom: start, missedBefore: today, basedOn: version })
  return { plannedFrom: planFrom, version: version + 1, blockCount: rows.length }
}

const runKey = (owner: string) => `ekagra-plan-run:${owner}`

/** When this device last made the plan (see planIsFresh). */
export function readPlanRun(owner: string): PlanRun | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(runKey(owner)) ?? 'null')
    if (typeof saved !== 'object' || saved === null) return null
    const { ranOn, plannedFrom, fingerprint } = saved as Record<string, unknown>
    return typeof ranOn === 'string' && typeof plannedFrom === 'string' && typeof fingerprint === 'string' ? { ranOn, plannedFrom, fingerprint } : null
  } catch {
    return null
  }
}

function writePlanRun(owner: string, run: PlanRun): void {
  try {
    localStorage.setItem(runKey(owner), JSON.stringify(run))
  } catch {
    // Storage is blocked: the plan is just made again next time.
  }
}

/** A fingerprint of everything that changes the plan. Null until it's all loaded (or before setup is done). */
export function usePlanFingerprint(): string | null {
  const profile = useProfile()
  const routine = useRoutine()
  const study = useStudy()
  if (!profile.data?.onboarded_at || !routine.data || !study.data) return null
  return planFingerprint({
    settings: profile.data.settings,
    chronotype: profile.data.chronotype,
    routine: routine.data.map((row) => [row.kind, row.days_of_week, row.start_time, row.end_time, row.valid_from, row.valid_to]),
    subjects: study.data.subjects.map((subject) => [subject.id, subject.exam_date]),
    // Only "learned or not" matters to the planner (starting a topic doesn't change the plan).
    topics: study.data.topics
      .filter((topic) => topic.parent_id !== null)
      .map((topic) => [topic.id, topic.est_minutes, topic.status === 'review' || topic.status === 'mastered', Number(topic.priority_score), topic.track, topic.difficulty]),
    prereqs: study.data.prereqs.map((link) => `${link.topic_id}>${link.prereq_topic_id}`),
  })
}

/** For screens: make the plan again (from now, or from tomorrow after the evening check-in). */
export function usePlanner() {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  const fingerprint = usePlanFingerprint()
  const mutation = useMutation({
    mutationFn: ({ from }: { from: ReplanFrom; fingerprint: string | null }) => replan(need(source), { from }),
    onSuccess: (result, { fingerprint: usedFingerprint }) => {
      if (owner) writePlanRun(owner, { ranOn: localDateOf(new Date()), plannedFrom: result.plannedFrom, fingerprint: usedFingerprint ?? '' })
    },
    // Show the new plan, or (after a conflict) the plan another device just saved.
    onSettled: () => queryClient.invalidateQueries({ queryKey: planKey(owner) }),
  })
  return {
    fingerprint,
    replan: (from: ReplanFrom = 'now') => mutation.mutate({ from, fingerprint }),
    replanAsync: (from: ReplanFrom = 'now') => mutation.mutateAsync({ from, fingerprint }),
    isPending: mutation.isPending,
    error: mutation.error instanceof PlanConflictError ? null : mutation.error,
  }
}

/**
 * Keeps the plan up to date while the app is open: it is made again when the app opens with a
 * plan from an earlier day, and whenever the planner's inputs change (roadmap, routine, settings).
 */
export function usePlanKeeper(): void {
  const { owner } = useDataSource()
  const { fingerprint, replan: makePlan, isPending } = usePlanner()
  const today = localDateOf(useNow(60_000))
  const attempted = useRef<string | null>(null)

  useEffect(() => {
    if (!owner || !fingerprint || isPending) return
    if (planIsFresh(readPlanRun(owner), today, fingerprint)) return
    // One try per day and set of inputs, so a failure doesn't repeat in a loop.
    const attempt = `${owner}:${today}:${fingerprint}`
    if (attempted.current === attempt) return
    attempted.current = attempt
    makePlan('now')
  }, [owner, fingerprint, today, isPending, makePlan])
}
