import type { FlatReviewChange, ReviewRequest } from '@shared/schemas.ts'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { isOnTarget } from '@/features/metrics/challenge'
import type { Metric } from '@/features/metrics/metrics'
import type { MentorTone } from '@/features/profile/settings'
import { changeKey, changeProblem, fromFlatChange, type ChangeContext, type ReviewChange } from './changes'
import type { WeekStats } from './weekStats'

// Between the week's numbers and ai-review: the request (subjects as short keys s1, s2, … instead
// of ids) and reading the answer back (only complete changes that pass the checks, no doubles, at
// most 3). Pure functions, tested on their own.

export interface ReviewContext extends ChangeContext {
  mentorTone: MentorTone
  /** 'YYYY-MM-DD', for the days until each exam. */
  today: string
  /** The reviewed week's challenge. */
  challenge: { metric: Metric; target: number } | null
}

export const MAX_CHANGES = 3

export function toReviewRequest(stats: WeekStats, ctx: ReviewContext): { request: ReviewRequest; subjectIdByKey: Map<string, string> } {
  const subjects = stats.subjects.slice(0, 30)
  const keyById = new Map(subjects.map((subject, index) => [subject.id, `s${index + 1}`]))
  const subjectIdByKey = new Map([...keyById].map(([id, key]) => [key, id]))
  const { settings } = ctx
  return {
    subjectIdByKey,
    request: {
      weekStart: stats.weekStart,
      mentorTone: ctx.mentorTone,
      stats: {
        areas: stats.areas,
        blocks: stats.blocks,
        subjects: subjects.map((subject) => {
          const info = ctx.subjects.get(subject.id)
          const examDate = info?.examDate ?? null
          return {
            key: keyById.get(subject.id) ?? '',
            name: subject.name.trim().slice(0, 120) || 'Subject',
            kind: info?.kind === 'skill_course' ? ('skill_course' as const) : ('course' as const),
            planned: subject.planned,
            done: subject.done,
            attempts: subject.attempts,
            accuracy: subject.accuracy,
            examInDays: examDate ? differenceInCalendarDays(parseISO(examDate), parseISO(ctx.today)) : null,
            weeklyMinutes: info?.kind === 'skill_course' ? (info.weeklyMinutes ?? ctx.defaultSkillMinutes) : null,
          }
        }),
        topicsLearned: stats.topicsLearned.slice(0, 50).map((topic) => ({ title: topic.title.slice(0, 200), subjectKey: keyById.get(topic.subjectId) ?? '' })),
        quiz: stats.quiz,
        accuracyByWindow: stats.accuracyByWindow,
        reviews: stats.reviews,
        focus: stats.focus,
        distractions: {
          ...stats.distractions,
          topApps: stats.distractions.topApps.map((app) => ({ app: app.app.slice(0, 120), count: app.count })),
          reasons: stats.distractions.reasons.map((reason) => ({ reason: reason.reason.slice(0, 40), count: reason.count })),
        },
        checkIns: stats.checkIns,
        tasks: stats.tasks,
        hustle: { minutes: stats.hustle.minutes, income: stats.hustle.income.slice(0, 5) },
        sleep: stats.sleep,
        workouts: stats.workouts,
        metrics: stats.metrics,
      },
      settings: {
        budget: settings.budget,
        bufferPct: settings.planner.bufferPct,
        maxReviewMinutes: settings.planner.maxReviewMinutes,
        newCardsPerDay: settings.learning.newCardsPerDay,
        maxBlockMinutes: settings.planner.maxBlockMinutes,
        revisionDays: settings.planner.revisionDays,
        peak: ctx.peak,
        blockAppsInStudy: settings.focus.blockDuring === 'study_blocks',
        // Only the subjects in this review have keys.
        subjectWindows: Object.fromEntries(
          Object.entries(settings.planner.subjectWindows).flatMap(([id, window]) => {
            const key = keyById.get(id)
            return key ? [[key, window]] : []
          }),
        ),
      },
      challenge: ctx.challenge
        ? { metric: ctx.challenge.metric, target: ctx.challenge.target, onTarget: isOnTarget(ctx.challenge.metric, stats.metrics?.[ctx.challenge.metric] ?? null, ctx.challenge.target) }
        : null,
    },
  }
}

/** Up to 3 changes that can really be applied: complete, not already set, one per setting. */
export function usableChanges(candidates: { change: ReturnType<typeof fromFlatChange>; reason: string }[], ctx: ChangeContext): ReviewChange[] {
  const seen = new Set<string>()
  const changes: ReviewChange[] = []
  for (const { change, reason } of candidates) {
    if (!change || changeProblem(change, ctx) !== null || seen.has(changeKey(change))) continue
    seen.add(changeKey(change))
    changes.push({ ...change, reason: reason.trim().slice(0, 300), status: 'open' })
    if (changes.length === MAX_CHANGES) break
  }
  return changes
}

/** The AI's answer as the review keeps it. */
export function readReviewAnswer(answer: { insights: string[]; changes: FlatReviewChange[] }, ctx: ChangeContext, subjectIdByKey: ReadonlyMap<string, string>): { insights: string[]; changes: ReviewChange[] } {
  return {
    insights: answer.insights.map((insight) => insight.trim()).filter(Boolean).slice(0, 3),
    changes: usableChanges(
      answer.changes.map((flat) => ({ change: fromFlatChange(flat, subjectIdByKey), reason: flat.reason })),
      ctx,
    ),
  }
}
