import { differenceInCalendarDays, parseISO } from 'date-fns'
import { countLabel } from '@/features/academics/labels'
import { METRIC_LABEL, metricValueLabel, type Metric } from '@/features/metrics/metrics'
import { DAY_WINDOWS } from '@/features/planner/planner'
import type { Area } from '@/features/planner/types'
import { fitNumber, NUMBER_RULES, type Change, type ReviewChange } from './changes'
import { usableChanges, type ReviewContext } from './review'
import { WINDOW_PHRASE, type WeekStats } from './weekStats'

// The weekly review written on the device, from fixed rules (Demo Mode, and when the AI can't be
// reached). Each rule looks at one part of the week's numbers and may give an insight and a change;
// the strongest 3 of each are kept. Pure functions, tested on their own.

interface Idea {
  /** Higher comes first. */
  score: number
  insight?: string
  change?: Change
  reason?: string
}

/** Below this many finished blocks, answers or reviews, a rule says nothing. */
const MIN_BLOCKS = 5
const MIN_ANSWERS_PER_WINDOW = 8
const MIN_REVIEWS = 10

const percent = (share: number) => `${Math.round(share * 100)}%`
const byScore = (a: Idea, b: Idea) => b.score - a.score

function ideas(stats: WeekStats, ctx: ReviewContext): Idea[] {
  const { settings } = ctx
  const found: Idea[] = []

  // Plan blocks: finished, ended early, missed.
  const finished = stats.blocks.done + stats.blocks.partial + stats.blocks.missed
  if (finished >= MIN_BLOCKS) {
    const rate = stats.blocks.done / finished
    if (rate < 0.6) {
      const endedEarly = stats.blocks.partial >= stats.blocks.missed && settings.planner.maxBlockMinutes > NUMBER_RULES.set_block_length.min
      found.push({
        score: 90,
        insight: `You finished ${stats.blocks.done} of ${finished} study blocks (${percent(rate)}): ${stats.blocks.missed} were missed and ${stats.blocks.partial} ended early.`,
        change: endedEarly
          ? { type: 'set_block_length', value: fitNumber(NUMBER_RULES.set_block_length, settings.planner.maxBlockMinutes - 15) }
          : { type: 'set_buffer', value: fitNumber(NUMBER_RULES.set_buffer, settings.planner.bufferPct + 5) },
        reason: endedEarly ? 'Many blocks ended early: shorter ones are easier to finish.' : 'Many blocks were missed: more unplanned time keeps the plan realistic.',
      })
    } else if (rate >= 0.85) {
      found.push({ score: 60, insight: `You finished ${percent(rate)} of your study blocks (${stats.blocks.done} of ${finished}). Keep it going.` })
    }
  }

  // Accuracy by part of the day (the last 4 weeks).
  const windows = DAY_WINDOWS.flatMap((window) => {
    const { attempts, accuracy } = stats.accuracyByWindow[window]
    return attempts >= MIN_ANSWERS_PER_WINDOW && accuracy !== null ? [{ window, accuracy }] : []
  }).sort((a, b) => b.accuracy - a.accuracy)
  const best = windows[0]
  const worst = windows[windows.length - 1]
  if (best && worst && best.accuracy - worst.accuracy >= 0.15) {
    const main = stats.subjects.find((subject) => subject.done > 0 && ctx.subjects.get(subject.id)?.kind === 'course')
    const move = main && settings.planner.subjectWindows[main.id] !== best.window
    found.push({
      score: 85,
      insight: `Your answers were ${percent(best.accuracy - worst.accuracy)} more accurate ${WINDOW_PHRASE[best.window]} than ${WINDOW_PHRASE[worst.window]}.`,
      change: move ? { type: 'move_subject_to_window', subjectId: main.id, window: best.window } : { type: 'set_peak_window', window: best.window },
      reason: `You answer best ${WINDOW_PHRASE[best.window]}.`,
    })
  }

  // Flashcard retention.
  const { count, retention } = stats.reviews
  if (count >= MIN_REVIEWS && retention !== null) {
    if (retention < 0.8) {
      found.push({
        score: 80,
        insight: `You remembered ${percent(retention)} of your flashcard reviews; 85–90% is the aim.`,
        change: settings.learning.newCardsPerDay > 5 ? { type: 'set_new_cards', value: fitNumber(NUMBER_RULES.set_new_cards, settings.learning.newCardsPerDay - 5) } : undefined,
        reason: 'Fewer new cards a day gives the older ones room to stick.',
      })
    } else if (retention >= 0.9 && count >= 2 * MIN_REVIEWS) {
      found.push({ score: 50, insight: `You remembered ${percent(retention)} of ${count} flashcard reviews: your memory is working well.` })
    }
  }

  // Distractions.
  const { total, topApps, topHours } = stats.distractions
  if (total >= 5) {
    const app = topApps[0]
    const hour = topHours[0]
    const when = hour ? `, mostly around ${String(hour.hour).padStart(2, '0')}:00` : ''
    found.push({
      score: 75,
      insight: app ? `${app.app} pulled you away ${app.count} times${when}.` : `You were distracted ${total} times${when}.`,
      change: settings.focus.blockDuring === 'study_blocks' ? undefined : { type: 'block_apps_in_study' },
      reason: 'Blocking distracting apps in every study block takes the temptation away.',
    })
  }

  // Energy at the evening check-ins.
  const { days, energy, crashedDays } = stats.checkIns
  if (days >= 3 && energy !== null && energy <= 2.5) {
    const from: Area = settings.budget.academics >= settings.budget.hustle ? 'academics' : 'hustle'
    found.push({
      score: 70,
      insight: `Your energy averaged ${energy}/5 at the evening check-ins${crashedDays > 0 ? `, with ${countLabel(crashedDays, 'minimum day')}` : ''}.`,
      change: settings.budget[from] >= 10 ? { type: 'shift_budget', from, to: 'life', points: 5 } : undefined,
      reason: 'More time for rest and life helps you recover.',
    })
  }

  // Exams coming up: finishing topics two weeks early leaves time to revise.
  const exams = [...ctx.subjects]
    .flatMap(([id, subject]) => {
      if (subject.kind !== 'course' || !subject.examDate) return []
      const inDays = differenceInCalendarDays(parseISO(subject.examDate), parseISO(ctx.today))
      return inDays > 0 && inDays <= 30 ? [{ id, name: subject.name, inDays }] : []
    })
    .sort((a, b) => a.inDays - b.inDays)
  const exam = exams[0]
  if (exam) {
    const longer = exam.inDays > 14 && settings.planner.revisionDays < 14
    found.push({
      score: 68,
      insight: `${exam.name}'s exam is in ${exam.inDays} days.`,
      change: longer ? { type: 'set_revision_days', value: 14 } : undefined,
      reason: 'Finishing topics two weeks before the exam leaves time to revise.',
    })
  }

  // Time per area against the budget.
  const academics = stats.areas.academics
  const totalDone = academics.done + stats.areas.hustle.done + stats.areas.life.done
  if (totalDone >= 120 && academics.sharePct <= academics.budgetPct - 15) {
    found.push({ score: 65, insight: `Academics got ${academics.sharePct}% of the time you put in, against ${academics.budgetPct}% planned.` })
  }

  if (stats.tasks.overdue >= 3) {
    found.push({ score: 62, insight: `${stats.tasks.overdue} tasks are overdue: finish, move or drop them so the plan stays honest.` })
  }

  const learned = stats.topicsLearned
  if (learned.length > 0) {
    const names = learned
      .slice(0, 3)
      .map((topic) => topic.title)
      .join(', ')
    found.push({ score: 55, insight: `You learned ${countLabel(learned.length, 'topic')}: ${names}${learned.length > 3 ? ' and more' : ''}.` })
  }

  // Next week's challenge: the measured metric with the most room below its aim.
  const metrics = stats.metrics
  const aims: [Metric, number][] = [
    ['memory', 0.85],
    ['problem_solving', 0.6],
    ['learning_speed', 1],
  ]
  const room = metrics ? aims.find(([metric, aim]) => metrics[metric] !== null && (metrics[metric] ?? 0) < aim) : undefined
  if (room && metrics && room[0] !== ctx.challenge?.metric) {
    const [metric] = room
    found.push({ score: 40, change: { type: 'challenge_metric', metric }, reason: `${METRIC_LABEL[metric]} has the most room to grow (${metricValueLabel(metric, metrics[metric])} this week).` })
  }

  return found
}

/** The review from the rules: up to 3 insights (one at least) and up to 3 changes that can be applied. */
export function localReview(stats: WeekStats, ctx: ReviewContext): { insights: string[]; changes: ReviewChange[] } {
  const found = ideas(stats, ctx).sort(byScore)
  const insights = found.flatMap((idea) => (idea.insight ? [idea.insight] : [])).slice(0, 3)
  if (insights.length === 0) insights.push('There was little to measure this week. Plan a few study blocks and mark them done, and next week brings a real review.')
  const changes = usableChanges(
    found.flatMap((idea) => (idea.change ? [{ change: idea.change, reason: idea.reason ?? '' }] : [])),
    ctx,
  )
  return { insights, changes }
}
