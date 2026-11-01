// Types shared by the planner engine.
//
// Everything is in the student's LOCAL time:
//   - dates are 'YYYY-MM-DD' strings (LocalDate)
//   - times of day are minutes after local midnight (Minute): 7:30 AM = 450, 11 PM = 1380
// Turning these into UTC timestamps for the database happens outside the engine (Milestone 4).

export type LocalDate = string
export type Minute = number

/** A stretch of time [start, end): the start minute is included, the end minute is not. */
export interface Interval {
  start: Minute
  end: Minute
}

export type Area = 'academics' | 'hustle' | 'life'

/** How free time is shared between the areas, in percent (adds up to 100). */
export type Budget = Record<Area, number>

export type Chronotype = 'early' | 'neutral' | 'night'

export type RoutineKind = 'class' | 'sleep' | 'gym' | 'meal' | 'commute' | 'custom'

/** A fixed, repeating part of the week (one row of routine_blocks). */
export interface RoutineBlock {
  kind: RoutineKind
  title: string
  /** 0 = Sunday … 6 = Saturday: the days the block STARTS on. */
  daysOfWeek: number[]
  /** 'HH:MM' */
  start: string
  /** 'HH:MM'. Not later than `start` means it ends the next day, e.g. sleep 23:00–07:00. */
  end: string
  validFrom?: LocalDate | null
  validTo?: LocalDate | null
}

export interface PlannerSubject {
  id: string
  name: string
  examDate: LocalDate | null
}

export interface PlannerTopic {
  id: string
  subjectId: string
  title: string
  track: 'exam' | 'skill'
  /** Minutes still needed. The caller works this out (estimate × learning speed × what's left). */
  remainingMinutes: number
  /** 1 (easy) – 5 (hard). Hard topics (4–5) go into the best focus hours. */
  difficulty: number
  /** 0–1, from priority.ts. */
  priority: number
  /** Topics that must be learned first. */
  prerequisiteIds: string[]
  /** Position in the syllabus; breaks ties. */
  orderIndex: number
}

export interface PlannerTask {
  id: string
  /** 'personal' tasks use Life time. */
  area: Area | 'personal'
  title: string
  dueDate: LocalDate | null
  remainingMinutes: number
  /** 1 = most important … 4 = least. */
  priority: number
  subjectId?: string | null
}

export interface PlannerCheckIn {
  date: LocalDate
  /** 1–5 from the evening check-in; null if there's no energy rating (e.g. only "I Crashed"). */
  energy: number | null
  /** "I Crashed" was pressed for this day. */
  minimumDay: boolean
}

export interface PlannerSettings {
  budget: Budget
  /** Part of free time that stays unplanned (breaks, surprises). */
  bufferPct: number
  /** Topics should be finished this many days before the exam, leaving time to revise. */
  revisionDays: number
  maxReviewMinutes: number
  /** Auto-recovery: a day may grow by at most this much over its normal plan. */
  maxDailyIncreasePct: number
  examSeasonDays: number
  examSeasonBudget: Budget
  burnoutEnergyMax: number
  burnoutCheckIns: number
  burnoutWindowDays: number
  burnoutReductionPct: number
  minimumDayTopMinutes: number
  minimumDayReviewMinutes: number
  /** Longest block. Keep it a multiple of 5. */
  maxBlockMinutes: number
  minBlockMinutes: number
  gapMinutes: number
  maxSameSubjectInARow: number
  /** Best focus hours: hard topics are placed here first. */
  peakWindow: Interval
}

export type BlockKind = 'learn' | 'review' | 'task' | 'hustle' | 'life'

/** Some amount of work the planner has to fit into the days. */
export interface WorkItem {
  /** Stable id: 'topic:<id>', 'task:<id>', 'review', 'hustle' or 'life'. */
  key: string
  area: Area
  kind: BlockKind
  title: string
  minutes: number
  topicId?: string
  taskId?: string
  subjectId?: string
  difficulty?: number
  /** Moved or missed work being caught up (auto-recovery). */
  recovered?: boolean
}

export interface PlannedBlock {
  date: LocalDate
  start: Minute
  end: Minute
  key: string
  area: Area
  kind: BlockKind
  title: string
  topicId?: string
  taskId?: string
  subjectId?: string
  recovered?: boolean
}

export interface DayPlan {
  date: LocalDate
  /** Usable free time after the routine (and after "now" for today). */
  free: Interval[]
  freeMinutes: number
  /** Free minutes minus the buffer (and minus the Burnout Guard cut). */
  capacityMinutes: number
  budget: Budget
  /** The capacity split by the budget, in minutes. */
  areaMinutes: Record<Area, number>
  examSeason: boolean
  burnoutGuard: boolean
  /** "I Crashed" day: only the top block and reviews. */
  minimumDay: boolean
  /** Minutes the day would have without any carry-over: the base for the +20% growth cap. */
  normalMinutes: number
  /** What was given to this day, most important first. */
  work: WorkItem[]
  /** The time blocks, sorted by start time. */
  blocks: PlannedBlock[]
}

export type AtRiskReason = 'deadline' | 'exam' | 'no_room'

/** Work the plan can't finish in time: shown to the student with options (Milestone 4). */
export interface AtRiskItem extends WorkItem {
  reason: AtRiskReason
}

export interface PlannerInput {
  today: LocalDate
  /** Current local time; today's plan starts after it. */
  nowMinute: Minute
  /** Number of days to plan. Default 14. */
  horizonDays?: number
  routine: RoutineBlock[]
  subjects: PlannerSubject[]
  topics: PlannerTopic[]
  tasks: PlannerTask[]
  /** Flashcard + mistake review minutes due per day. */
  reviewMinutes?: Record<LocalDate, number>
  checkIns: PlannerCheckIn[]
  /** Missed or moved work from earlier days, caught up by auto-recovery.
   *  Don't also count these minutes in the topics' or tasks' remainingMinutes. */
  carryOver?: WorkItem[]
  settings?: Partial<PlannerSettings>
}

export interface Plan {
  days: DayPlan[]
  atRisk: AtRiskItem[]
}
