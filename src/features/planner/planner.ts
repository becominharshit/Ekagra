import { addDays, daysBetween, freeIntervals, MINUTES_PER_DAY, subtractIntervals, totalMinutes } from './time'
import type {
  Area,
  AtRiskItem,
  AtRiskReason,
  Budget,
  Chronotype,
  DayPlan,
  Interval,
  LocalDate,
  Minute,
  Plan,
  PlannedBlock,
  PlannerCheckIn,
  PlannerInput,
  PlannerSettings,
  PlannerSubject,
  PlannerTask,
  PlannerTopic,
  WorkItem,
} from './types'

// The planner turns your routine, subjects, topics and tasks into a 14-day plan.
// It is made only of pure functions: no database, no clock, no randomness.
// The same input always gives the same plan, which makes it easy to test.
//
// How each day is planned (buildPlan):
//   1. Free time   = the day minus your routine (today: only the time after "now").
//   2. Capacity    = free time minus a 12% buffer (and 30% less when the Burnout Guard is on).
//   3. Budget      = capacity split 55/25/20, or 80/5/15 in exam season.
//   4. Allocation  = each area is filled in priority order (allocateDay).
//   5. Placement   = the work becomes time blocks (placeDay).
//   6. "I Crashed" = today keeps only the top block and reviews; the rest moves on.
//   7. Recovery    = moved or missed work goes before "getting ahead" on the next days,
//                    and a day may grow by at most 20% over its normal plan.

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const STANDARD_BUDGET: Budget = { academics: 55, hustle: 25, life: 20 }
export const EXAM_SEASON_BUDGET: Budget = { academics: 80, hustle: 5, life: 15 }

/** Best focus hours for each rhythm (used unless the student picks their own). */
export const PEAK_WINDOWS: Record<Chronotype, Interval> = {
  early: { start: 7 * 60, end: 11 * 60 },
  neutral: { start: 9 * 60, end: 13 * 60 },
  night: { start: 18 * 60, end: 22 * 60 },
}

export const DEFAULT_PLANNER_SETTINGS: PlannerSettings = {
  budget: STANDARD_BUDGET,
  bufferPct: 12,
  revisionDays: 10,
  maxReviewMinutes: 30,
  maxDailyIncreasePct: 20,
  examSeasonDays: 21,
  examSeasonBudget: EXAM_SEASON_BUDGET,
  burnoutEnergyMax: 2,
  burnoutCheckIns: 3,
  burnoutWindowDays: 7,
  burnoutReductionPct: 30,
  minimumDayTopMinutes: 30,
  minimumDayReviewMinutes: 15,
  maxBlockMinutes: 50,
  minBlockMinutes: 15,
  gapMinutes: 5,
  maxSameSubjectInARow: 2,
  peakWindow: PEAK_WINDOWS.neutral,
}

export function resolveSettings(overrides: Partial<PlannerSettings> = {}): PlannerSettings {
  return { ...DEFAULT_PLANNER_SETTINGS, ...overrides }
}

const floorTo5 = (minutes: number) => Math.floor(minutes / 5) * 5
const ceilTo5 = (minutes: number) => Math.ceil(minutes / 5) * 5
const roundTo5 = (minutes: number) => Math.round(minutes / 5) * 5
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
const blockMinutes = (block: PlannedBlock) => block.end - block.start
const isRealWork = (item: WorkItem) => item.kind === 'learn' || item.kind === 'task'
const NO_DATE: LocalDate = '9999-12-31'

// ---------------------------------------------------------------------------
// Rules for one day: small pure functions, each tested on its own
// ---------------------------------------------------------------------------

/** Days from `date` until the nearest exam on or after it, or null when there's none. */
export function daysToNextExam(date: LocalDate, subjects: PlannerSubject[]): number | null {
  const upcoming = subjects
    .flatMap((subject) => (subject.examDate ? [daysBetween(date, subject.examDate)] : []))
    .filter((days) => days >= 0)
  return upcoming.length > 0 ? Math.min(...upcoming) : null
}

/** Exam season = an exam is 0–21 days away: the budget becomes 80/5/15 and the skill track pauses. */
export function dayBudget(
  date: LocalDate,
  subjects: PlannerSubject[],
  settings: PlannerSettings,
): { budget: Budget; examSeason: boolean } {
  const days = daysToNextExam(date, subjects)
  const examSeason = days !== null && days <= settings.examSeasonDays
  return { budget: examSeason ? settings.examSeasonBudget : settings.budget, examSeason }
}

/** Burnout Guard: the 3 most recent check-ins from the 7 days before today all have energy ≤ 2. */
export function burnoutGuard(today: LocalDate, checkIns: PlannerCheckIn[], settings: PlannerSettings): boolean {
  const recent = checkIns
    .filter(
      (checkIn) =>
        checkIn.energy !== null &&
        checkIn.date < today &&
        daysBetween(checkIn.date, today) <= settings.burnoutWindowDays,
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, settings.burnoutCheckIns)
  return (
    recent.length === settings.burnoutCheckIns &&
    recent.every((checkIn) => (checkIn.energy ?? Number.POSITIVE_INFINITY) <= settings.burnoutEnergyMax)
  )
}

/** Splits minutes by a budget in 5-minute steps. The three parts always add up to `minutes`. */
export function splitByBudget(minutes: number, budget: Budget): Record<Area, number> {
  const total = budget.academics + budget.hustle + budget.life
  if (minutes <= 0 || total <= 0) return { academics: 0, hustle: 0, life: 0 }
  const academics = Math.min(minutes, roundTo5((minutes * budget.academics) / total))
  const hustle = Math.min(minutes - academics, roundTo5((minutes * budget.hustle) / total))
  return { academics, hustle, life: minutes - academics - hustle }
}

/** Auto-recovery cap: how many minutes a day may grow above its normal plan (20% of it). */
export function growthAllowance(normalMinutes: number, settings: PlannerSettings): number {
  return Math.max(0, Math.floor((normalMinutes * settings.maxDailyIncreasePct) / 100))
}

/**
 * "I Crashed": keep the most important piece of work (≤ 30 min) and the reviews (≤ 15 min).
 * The rest of the real work (topics and assignments) moves to the next days.
 * Today's general Hustle/Life time and the extra review minutes are simply dropped.
 */
export function minimumDayWork(
  work: WorkItem[],
  settings: PlannerSettings,
): { keep: WorkItem[]; moved: WorkItem[] } {
  const top = work.find(isRealWork)
  const review = work.find((item) => item.kind === 'review')
  const keep: WorkItem[] = []
  if (top) keep.push({ ...top, minutes: Math.min(top.minutes, settings.minimumDayTopMinutes) })
  if (review) keep.push({ ...review, minutes: Math.min(review.minutes, settings.minimumDayReviewMinutes) })
  const moved = work
    .filter(isRealWork)
    .map((item) => (item === top ? { ...item, minutes: item.minutes - settings.minimumDayTopMinutes } : { ...item }))
    .filter((item) => item.minutes > 0)
  return { keep, moved }
}

/** Cuts work into blocks of at most `maxBlock` minutes, in 5-minute steps where possible. */
export function splitIntoChunks(minutes: number, maxBlock: number): number[] {
  if (minutes <= 0) return []
  const count = Math.ceil(minutes / maxBlock)
  if (count === 1) return [minutes]
  const base = floorTo5(minutes / count)
  let rest = minutes - base * count
  const sizes: number[] = []
  for (let index = 0; index < count; index++) {
    const bonus = rest >= 5 && base + 5 <= maxBlock ? 5 : 0
    rest -= bonus
    sizes.push(base + bonus)
  }
  // The last few minutes (fewer than 5) go on the last block.
  sizes[count - 1] = (sizes[count - 1] ?? 0) + rest
  return sizes
}

export function plannedMinutes(day: DayPlan): number {
  return sum(day.blocks.map(blockMinutes))
}

export function minutesByArea(day: DayPlan): Record<Area, number> {
  const totals: Record<Area, number> = { academics: 0, hustle: 0, life: 0 }
  for (const block of day.blocks) totals[block.area] += blockMinutes(block)
  return totals
}

// ---------------------------------------------------------------------------
// The 14-day plan
// ---------------------------------------------------------------------------

/** Minutes of each topic and task that haven't been given to a day yet. */
interface Pool {
  topicLeft: Map<string, number>
  taskLeft: Map<string, number>
}

interface DayContext {
  date: LocalDate
  examSeason: boolean
  areaMinutes: Record<Area, number>
  input: PlannerInput
  settings: PlannerSettings
  tasksByDeadline: PlannerTask[]
  subjectsById: Map<string, PlannerSubject>
}

export function buildPlan(input: PlannerInput): Plan {
  const settings = resolveSettings(input.settings)
  const horizon = Math.max(1, Math.floor(input.horizonDays ?? 14))
  const lastDate = addDays(input.today, horizon - 1)
  const pool: Pool = {
    topicLeft: new Map(input.topics.map((topic) => [topic.id, Math.max(0, Math.round(topic.remainingMinutes))])),
    taskLeft: new Map(input.tasks.map((task) => [task.id, Math.max(0, Math.round(task.remainingMinutes))])),
  }
  const tasksByDeadline = [...input.tasks].sort(byDeadline)
  const subjectsById = new Map(input.subjects.map((subject) => [subject.id, subject]))
  const crashedToday = input.checkIns.some((checkIn) => checkIn.date === input.today && checkIn.minimumDay)
  let carry: WorkItem[] = (input.carryOver ?? [])
    .filter((item) => item.minutes > 0)
    .map((item) => ({ ...item, recovered: true }))
  const days: DayPlan[] = []

  for (let index = 0; index < horizon; index++) {
    const date = addDays(input.today, index)
    const isToday = index === 0
    const free = freeIntervals(input.routine, date, isToday ? ceilTo5(input.nowMinute) : 0, settings.minBlockMinutes)
    const freeMinutes = totalMinutes(free)
    const { budget, examSeason } = dayBudget(date, input.subjects, settings)
    const guard = isToday && burnoutGuard(input.today, input.checkIns, settings)
    const buffered = floorTo5(freeMinutes * (1 - settings.bufferPct / 100))
    const capacityMinutes = guard ? floorTo5(buffered * (1 - settings.burnoutReductionPct / 100)) : buffered
    const ctx: DayContext = {
      date,
      examSeason,
      areaMinutes: splitByBudget(capacityMinutes, budget),
      input,
      settings,
      tasksByDeadline,
      subjectsById,
    }

    // A dry run without carry-over gives the day's normal plan: the base for the +20% growth cap.
    const normalMinutes = sum(allocateDay(ctx, clonePool(pool), [], 0).map((item) => item.minutes))
    let work = allocateDay(ctx, pool, carry, growthAllowance(normalMinutes, settings))
    carry = carry.filter((item) => item.minutes > 0)

    const minimumDay = isToday && crashedToday
    if (minimumDay) {
      const { keep, moved } = minimumDayWork(work, settings)
      work = keep
      carry = [...carry, ...moved.map((item) => ({ ...item, recovered: true }))]
    }

    // Tasks due at a set time this day that is still ahead (an overdue one is simply done first).
    const dayStart = isToday ? input.nowMinute : 0
    const dueBy = new Map(
      input.tasks.flatMap((task) =>
        task.dueDate === date && task.dueMinute != null && task.dueMinute > dayStart ? [[task.id, task.dueMinute] as const] : [],
      ),
    )
    const { blocks, unplaced } = placeDay(date, free, work, settings, dueBy)
    // Real work that didn't fit into the time slots is tried again first on the next days.
    carry = [...unplaced.filter(isRealWork).map((item) => ({ ...item, recovered: true })), ...carry]

    days.push({
      date,
      free,
      freeMinutes,
      capacityMinutes,
      budget,
      areaMinutes: ctx.areaMinutes,
      examSeason,
      burnoutGuard: guard,
      minimumDay,
      normalMinutes,
      work,
      blocks,
    })
  }

  return { days, atRisk: collectRisks(input, days, pool, carry, lastDate) }
}

// ---------------------------------------------------------------------------
// Allocation: how many minutes of what go on one day
// ---------------------------------------------------------------------------

function clonePool(pool: Pool): Pool {
  return { topicLeft: new Map(pool.topicLeft), taskLeft: new Map(pool.taskLeft) }
}

function byDeadline(a: PlannerTask, b: PlannerTask): number {
  return (a.dueDate ?? NO_DATE).localeCompare(b.dueDate ?? NO_DATE) || a.priority - b.priority || a.id.localeCompare(b.id)
}

function byTopicPriority(a: PlannerTopic, b: PlannerTopic): number {
  return b.priority - a.priority || a.orderIndex - b.orderIndex || a.id.localeCompare(b.id)
}

function taskArea(task: PlannerTask): Area {
  return task.area === 'personal' ? 'life' : task.area
}

function topicItem(topic: PlannerTopic, minutes: number): WorkItem {
  return {
    key: `topic:${topic.id}`,
    area: 'academics',
    kind: 'learn',
    title: topic.title,
    minutes,
    topicId: topic.id,
    subjectId: topic.subjectId,
    difficulty: topic.difficulty,
  }
}

function taskItem(task: PlannerTask, minutes: number): WorkItem {
  return {
    key: `task:${task.id}`,
    area: taskArea(task),
    kind: 'task',
    title: task.title,
    minutes,
    taskId: task.id,
    subjectId: task.subjectId ?? undefined,
    hustleId: task.hustleId ?? undefined,
  }
}

/** Adds minutes to the matching item (same work, same "recovered" flag) or appends a new one. */
function addItem(items: WorkItem[], item: WorkItem): void {
  const same = items.find((other) => other.key === item.key && Boolean(other.recovered) === Boolean(item.recovered))
  if (same) same.minutes += item.minutes
  else items.push({ ...item })
}

/** Skill topics pause in exam season; exam topics stop after their subject's exam. */
function isTopicEligible(
  topic: PlannerTopic,
  date: LocalDate,
  examSeason: boolean,
  subjectsById: Map<string, PlannerSubject>,
): boolean {
  if (topic.track === 'skill') return !examSeason
  const examDate = subjectsById.get(topic.subjectId)?.examDate
  return !examDate || date <= examDate
}

/**
 * Fills one day, most important first:
 *   Academics: reviews → assignments (earliest due first) → each subject's pace → carry-over → getting ahead
 *   Hustle:    hustle tasks → carry-over → general "Hustle work" time
 *   Life:      life and personal tasks → carry-over → general "Life time"
 * Carry-over first uses its area's own time (taking it from "getting ahead" and the general
 * blocks); only after that may it use `growth`: extra minutes on top of the normal plan.
 */
function allocateDay(ctx: DayContext, pool: Pool, carry: WorkItem[], growth: number): WorkItem[] {
  const { date, examSeason, input, settings } = ctx
  const items: WorkItem[] = []
  let extra = growth

  function takeCarry(area: Area, share: number): number {
    let used = 0
    for (const item of carry) {
      if (item.area !== area || item.minutes <= 0) continue
      const fromShare = Math.max(0, share - used)
      const take = Math.min(item.minutes, fromShare + extra)
      if (take <= 0) break
      if (take < settings.minBlockMinutes && take < item.minutes) break
      extra -= Math.max(0, take - fromShare)
      used += take
      item.minutes -= take
      addItem(items, { ...item, minutes: take })
    }
    return used
  }

  // Academics
  let academics = ctx.areaMinutes.academics
  const review = Math.min(input.reviewMinutes?.[date] ?? 0, settings.maxReviewMinutes, academics)
  if (review > 0) {
    items.push({ key: 'review', area: 'academics', kind: 'review', title: 'Reviews: flashcards and mistakes', minutes: review })
    academics -= review
  }
  academics -= takeTasks(ctx, pool, items, 'academics', academics)
  const eligible = input.topics.filter((topic) => isTopicEligible(topic, date, examSeason, ctx.subjectsById))
  const eligibleIds = new Set(eligible.map((topic) => topic.id))
  academics -= takePace(ctx, pool, items, eligible, eligibleIds, academics)
  academics = Math.max(0, academics - takeCarry('academics', academics))
  takeTopics(eligible, eligibleIds, academics, pool, items, settings)

  // Hustle
  let hustle = ctx.areaMinutes.hustle
  hustle -= takeTasks(ctx, pool, items, 'hustle', hustle)
  hustle = Math.max(0, hustle - takeCarry('hustle', hustle))
  if (hustle >= settings.minBlockMinutes) {
    // With a hustle set up, its general time is named after it (and links to it).
    const named = input.hustle ? { title: input.hustle.name, hustleId: input.hustle.id } : { title: 'Hustle work' }
    items.push({ key: 'hustle', area: 'hustle', kind: 'hustle', minutes: hustle, ...named })
  }

  // Life
  let life = ctx.areaMinutes.life
  life -= takeTasks(ctx, pool, items, 'life', life)
  life = Math.max(0, life - takeCarry('life', life))
  if (life >= settings.minBlockMinutes) {
    items.push({ key: 'life', area: 'life', kind: 'life', title: 'Life time', minutes: life })
  }

  return items
}

/** Tasks of one area, earliest due date first. Returns the minutes used. */
function takeTasks(ctx: DayContext, pool: Pool, items: WorkItem[], area: Area, budget: number): number {
  let used = 0
  for (const task of ctx.tasksByDeadline) {
    if (taskArea(task) !== area) continue
    const left = pool.taskLeft.get(task.id) ?? 0
    const take = Math.min(left, budget - used)
    if (take <= 0 || (take < ctx.settings.minBlockMinutes && take < left)) continue
    pool.taskLeft.set(task.id, left - take)
    addItem(items, taskItem(task, take))
    used += take
  }
  return used
}

/**
 * Each subject with an exam gets its daily pace: what's left of its exam topics divided by the
 * days until 10 days before the exam. If all the paces don't fit, every subject gets a fair share.
 */
function takePace(
  ctx: DayContext,
  pool: Pool,
  items: WorkItem[],
  eligible: PlannerTopic[],
  eligibleIds: Set<string>,
  budget: number,
): number {
  const { date, settings } = ctx
  const paces: { topics: PlannerTopic[]; pace: number }[] = []
  const subjects = ctx.input.subjects
    .filter((subject) => subject.examDate !== null && subject.examDate >= date)
    .sort((a, b) => (a.examDate ?? NO_DATE).localeCompare(b.examDate ?? NO_DATE))
  for (const subject of subjects) {
    if (!subject.examDate) continue
    const topics = eligible.filter((topic) => topic.subjectId === subject.id && topic.track === 'exam')
    const left = sum(topics.map((topic) => pool.topicLeft.get(topic.id) ?? 0))
    if (left <= 0) continue
    const target = addDays(subject.examDate, -settings.revisionDays)
    const daysLeft = Math.max(1, daysBetween(date, target) + 1)
    // What was already studied today counts toward today's pace.
    const doneToday = date === ctx.input.today ? (ctx.input.doneTodayBySubject?.[subject.id] ?? 0) : 0
    const pace = Math.ceil(left / daysLeft) - doneToday
    if (pace > 0) paces.push({ topics, pace })
  }

  const totalPace = sum(paces.map((entry) => entry.pace))
  if (totalPace <= 0 || budget <= 0) return 0
  const scale = Math.min(1, budget / totalPace)
  let used = 0
  for (const { topics, pace } of paces) {
    const share = Math.min(budget - used, scale < 1 ? floorTo5(pace * scale) : pace)
    used += takeTopics(topics, eligibleIds, share, pool, items, settings)
  }
  return used
}

/** Topics by priority (prerequisites first) until `budget` is used. Returns the minutes used. */
function takeTopics(
  candidates: PlannerTopic[],
  eligibleIds: Set<string>,
  budget: number,
  pool: Pool,
  items: WorkItem[],
  settings: PlannerSettings,
): number {
  let used = 0
  while (budget - used > 0) {
    const topic = nextTopic(candidates, eligibleIds, pool)
    if (!topic) break
    const left = pool.topicLeft.get(topic.id) ?? 0
    const take = Math.min(left, budget - used)
    // Don't cut a topic into a piece too small to be a block.
    if (take < settings.minBlockMinutes && take < left) break
    pool.topicLeft.set(topic.id, left - take)
    addItem(items, topicItem(topic, take))
    used += take
  }
  return used
}

/** The best topic to learn next: highest priority among those whose prerequisites are done.
 *  If none is "ready" (e.g. circular prerequisites), the best one is used anyway, so the plan never gets stuck. */
function nextTopic(candidates: PlannerTopic[], eligibleIds: Set<string>, pool: Pool): PlannerTopic | undefined {
  const open = candidates.filter((topic) => (pool.topicLeft.get(topic.id) ?? 0) > 0)
  const ready = open.filter((topic) =>
    topic.prerequisiteIds.every((id) => !eligibleIds.has(id) || (pool.topicLeft.get(id) ?? 0) === 0),
  )
  return (ready.length > 0 ? ready : open).sort(byTopicPriority)[0]
}

// ---------------------------------------------------------------------------
// Placement: turning minutes into time blocks
// ---------------------------------------------------------------------------

interface Chunk {
  item: WorkItem
  minutes: number
}

/**
 * Places a day's work into its free time:
 *   1. Tasks due at a set time this day (`dueBy`, e.g. 5 PM) first, in the free time before
 *      they're due. If there's no room before then, as early as possible (late, but today).
 *   2. Hard topics (difficulty 4–5), inside the best focus hours.
 *   3. Then everything else in order, each block after the previous one: assignments, topics
 *      (subjects mixed, prerequisites first), reviews, hustle, life. After 2 blocks of the same
 *      subject, a review, hustle or life block comes in between (while there are some left).
 * Blocks are at most 50 minutes with 5-minute gaps. A block that doesn't fit after the previous
 * one goes into the earliest gap where it fits. Work that doesn't fit at all is returned as `unplaced`.
 */
function placeDay(
  date: LocalDate,
  free: Interval[],
  work: WorkItem[],
  settings: PlannerSettings,
  dueBy: ReadonlyMap<string, Minute> = new Map(),
): { blocks: PlannedBlock[]; unplaced: WorkItem[] } {
  let space = free
  const blocks: PlannedBlock[] = []
  const missing = new Map<WorkItem, number>()
  const allChunks: Chunk[] = work.flatMap((item) =>
    splitIntoChunks(item.minutes, settings.maxBlockMinutes).map((minutes) => ({ item, minutes })),
  )

  function put(chunk: Chunk, start: Minute): void {
    blocks.push(toBlock(date, start, chunk))
    // Reserve the block plus a gap on each side.
    space = subtractIntervals(space, [
      { start: start - settings.gapMinutes, end: start + chunk.minutes + settings.gapMinutes },
    ])
  }

  function tryPut(chunk: Chunk, window?: Interval): boolean {
    const start = findStart(space, chunk.minutes, window)
    if (start === null) return false
    put(chunk, start)
    return true
  }

  const dueAt = (chunk: Chunk) => (chunk.item.taskId === undefined ? undefined : dueBy.get(chunk.item.taskId))
  for (const chunk of allChunks) {
    const due = dueAt(chunk)
    if (due === undefined) continue
    // Starting at the latest at `due - minutes` means it's finished by the time it's due.
    if (!tryPut(chunk, { start: 0, end: due - chunk.minutes + 1 }) && !tryPut(chunk)) {
      missing.set(chunk.item, (missing.get(chunk.item) ?? 0) + chunk.minutes)
    }
  }
  const chunks = allChunks.filter((chunk) => dueAt(chunk) === undefined)

  const isHard = (chunk: Chunk) => chunk.item.kind === 'learn' && (chunk.item.difficulty ?? 0) >= 4
  const hardLeft: Chunk[] = []
  for (const chunk of chunks.filter(isHard)) {
    if (!tryPut(chunk, settings.peakWindow)) hardLeft.push(chunk)
  }

  const study = [
    ...chunks.filter((chunk) => chunk.item.area === 'academics' && chunk.item.kind === 'task'),
    ...interleave(
      [...hardLeft, ...chunks.filter((chunk) => chunk.item.kind === 'learn' && !isHard(chunk))],
      settings.maxSameSubjectInARow,
    ),
  ]
  const others = [
    ...chunks.filter((chunk) => chunk.item.kind === 'review'),
    ...chunks.filter((chunk) => chunk.item.area === 'hustle'),
    ...chunks.filter((chunk) => chunk.item.area === 'life'),
  ]
  // Each block starts after the previous one, so the order above is also the order in time.
  // (Otherwise a short piece of a topic could jump into an earlier gap, before its prerequisite.)
  let cursor: Minute = 0
  for (const chunk of withBreaks(study, others, settings.maxSameSubjectInARow)) {
    const start = findStart(space, chunk.minutes, { start: cursor, end: MINUTES_PER_DAY })
    if (start !== null) {
      put(chunk, start)
      cursor = start + chunk.minutes
      continue
    }
    if (tryPut(chunk)) continue
    // No gap is long enough: use the longest one left if a short block fits there.
    const longest = longestInterval(space)
    const fit = longest ? Math.min(chunk.minutes, longest.end - longest.start) : 0
    const placed = longest && fit >= settings.minBlockMinutes ? fit : 0
    if (longest && placed > 0) put({ ...chunk, minutes: placed }, longest.start)
    if (chunk.minutes > placed) missing.set(chunk.item, (missing.get(chunk.item) ?? 0) + chunk.minutes - placed)
  }

  blocks.sort((a, b) => a.start - b.start)
  return { blocks, unplaced: [...missing].map(([item, minutes]) => ({ ...item, minutes })) }
}

/** Earliest start where `minutes` fit (if a window is given, the block must start inside it). */
function findStart(space: Interval[], minutes: number, window?: Interval): Minute | null {
  for (const gap of space) {
    const start = window ? Math.max(gap.start, window.start) : gap.start
    if (window && start >= window.end) continue
    if (start + minutes <= gap.end) return start
  }
  return null
}

function longestInterval(space: Interval[]): Interval | undefined {
  return space.reduce<Interval | undefined>(
    (best, gap) => (!best || gap.end - gap.start > best.end - best.start ? gap : best),
    undefined,
  )
}

/** Orders learning blocks so the same subject never comes more than `maxInARow` times in a row
 *  (when another subject is available). The subject with the most blocks left goes next. */
function interleave(chunks: Chunk[], maxInARow: number): Chunk[] {
  const groups = new Map<string, Chunk[]>()
  for (const chunk of chunks) {
    const group = chunk.item.subjectId ?? chunk.item.key
    groups.set(group, [...(groups.get(group) ?? []), chunk])
  }
  const ordered: Chunk[] = []
  let last: string | null = null
  let run = 0
  while (ordered.length < chunks.length) {
    const options = [...groups.entries()]
      .filter(([, list]) => list.length > 0)
      .sort((a, b) => b[1].length - a[1].length)
    const pick = options.find(([group]) => group !== last || run < maxInARow) ?? options[0]
    const chunk = pick?.[1].shift()
    if (!pick || !chunk) break
    run = pick[0] === last ? run + 1 : 1
    last = pick[0]
    ordered.push(chunk)
  }
  return ordered
}

/** Study blocks in their order, but after `maxInARow` blocks of the same subject, one of the
 *  `others` (review, hustle or life) comes next while there are some left. Then the rest of them. */
function withBreaks(study: Chunk[], others: Chunk[], maxInARow: number): Chunk[] {
  const rest = [...others]
  const ordered: Chunk[] = []
  let last: string | null = null
  let run = 0
  for (const chunk of study) {
    const group = chunk.item.subjectId ?? chunk.item.key
    const breaker = group === last && run >= maxInARow ? rest.shift() : undefined
    if (breaker) {
      ordered.push(breaker)
      last = null
    }
    run = group === last ? run + 1 : 1
    last = group
    ordered.push(chunk)
  }
  return [...ordered, ...rest]
}

function toBlock(date: LocalDate, start: Minute, { item, minutes }: Chunk): PlannedBlock {
  return {
    date,
    start,
    end: start + minutes,
    key: item.key,
    area: item.area,
    kind: item.kind,
    title: item.title,
    topicId: item.topicId,
    taskId: item.taskId,
    subjectId: item.subjectId,
    hustleId: item.hustleId,
    recovered: item.recovered,
  }
}

// ---------------------------------------------------------------------------
// At-risk work: what the plan can't finish in time
// ---------------------------------------------------------------------------

function collectRisks(
  input: PlannerInput,
  days: DayPlan[],
  pool: Pool,
  carry: WorkItem[],
  lastDate: LocalDate,
): AtRiskItem[] {
  const risks = new Map<string, AtRiskItem>()
  const add = (item: WorkItem, minutes: number, reason: AtRiskReason) => {
    if (minutes <= 0) return
    const existing = risks.get(item.key)
    if (existing) existing.minutes += minutes
    else risks.set(item.key, { ...item, minutes, reason })
  }
  const carried = (matches: (item: WorkItem) => boolean) => sum(carry.filter(matches).map((item) => item.minutes))
  const blocks = days.flatMap((day) => day.blocks)

  // Assignments due inside the plan that will be late or aren't planned at all.
  for (const task of input.tasks) {
    const due = task.dueDate
    if (!due || due > lastDate) continue
    const dueMinute = task.dueMinute ?? MINUTES_PER_DAY
    const isLate = (block: PlannedBlock) => block.date > due || (block.date === due && block.end > dueMinute)
    const late = sum(blocks.filter((block) => block.taskId === task.id && isLate(block)).map(blockMinutes))
    const unplanned = (pool.taskLeft.get(task.id) ?? 0) + carried((item) => item.taskId === task.id)
    add(taskItem(task, 0), late + unplanned, 'deadline')
  }

  // Exam topics that can't be covered before an exam inside the plan.
  const examInPlan = new Set(
    input.subjects
      .filter((subject) => subject.examDate !== null && subject.examDate >= input.today && subject.examDate <= lastDate)
      .map((subject) => subject.id),
  )
  for (const topic of input.topics) {
    if (topic.track !== 'exam' || !examInPlan.has(topic.subjectId)) continue
    add(topicItem(topic, 0), (pool.topicLeft.get(topic.id) ?? 0) + carried((item) => item.topicId === topic.id), 'exam')
  }

  // Moved or missed work that found no room in the plan.
  const alreadyReported = new Set(risks.keys())
  for (const item of carry) {
    if (!alreadyReported.has(item.key)) add(item, item.minutes, 'no_room')
  }
  return [...risks.values()]
}
