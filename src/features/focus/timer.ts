// The focus timer: a session is a schedule of focus and break phases (Pomodoro 25/5, Deep work
// 50/10, or one custom stretch), and this works out where the timer is at any moment. Pauses
// freeze the schedule. Plain functions, tested; the clock and the pauses come from outside.

export type FocusMode = 'pomodoro' | 'deep' | 'custom'

export interface Lengths {
  /** Minutes of focus, then of break. */
  work: number
  break: number
}

/** The lengths of Pomodoro and Deep work (from the settings). */
export type TimerLengths = Record<'pomodoro' | 'deep', Lengths>

export interface Phase {
  kind: 'work' | 'break'
  minutes: number
}

export interface Pause {
  /** ISO timestamps; `to` is null while paused. */
  from: string
  to: string | null
}

export const DEFAULT_LENGTHS: TimerLengths = {
  pomodoro: { work: 25, break: 5 },
  deep: { work: 50, break: 10 },
}

export const TIMER_LABEL: Record<FocusMode, string> = { pomodoro: 'Pomodoro', deep: 'Deep work', custom: 'Custom' }

/** "25 min focus, 5 min break", or for Custom "Your minutes, no breaks". */
export function timerRhythm(mode: FocusMode, lengths: TimerLengths = DEFAULT_LENGTHS): string {
  if (mode === 'custom') return 'Your minutes, no breaks'
  return `${lengths[mode].work} min focus, ${lengths[mode].break} min break`
}

/** When fitting a block, a last stretch of focus shorter than this isn't worth a break before it. */
const SHORTEST_STRETCH = 10

/** The phases for `workMinutes` of focus: stretches of focus with breaks between them (none at the end). */
export function scheduleFor(mode: FocusMode, workMinutes: number, lengths: TimerLengths = DEFAULT_LENGTHS): Phase[] {
  const total = Math.max(1, Math.round(workMinutes))
  if (mode === 'custom') return [{ kind: 'work', minutes: total }]
  const { work, break: rest } = lengths[mode]
  const phases: Phase[] = []
  let left = total
  while (left > 0) {
    const stretch = Math.min(work, left)
    phases.push({ kind: 'work', minutes: stretch })
    left -= stretch
    if (left > 0) phases.push({ kind: 'break', minutes: rest })
  }
  return phases
}

/** Minutes from the start of the schedule to its end, breaks included. */
export function scheduleMinutes(phases: Phase[]): number {
  return phases.reduce((sum, phase) => sum + phase.minutes, 0)
}

/**
 * How many minutes of focus fit in `totalMinutes` (e.g. a 45-minute block with Pomodoro:
 * 25 focus + 5 break + 15 focus = 40). A last stretch shorter than 10 minutes is left out.
 */
export function workThatFits(mode: FocusMode, totalMinutes: number, lengths: TimerLengths = DEFAULT_LENGTHS): number {
  const total = Math.max(0, Math.floor(totalMinutes))
  if (mode === 'custom') return total
  const { work, break: rest } = lengths[mode]
  let left = total
  let focus = 0
  while (left > 0) {
    const stretch = Math.min(work, left)
    if (focus > 0 && stretch < SHORTEST_STRETCH) break
    focus += stretch
    left -= stretch + rest
  }
  return focus
}

/** Minutes of focus for a number of rounds (Pomodoro and Deep work). */
export function roundsWork(mode: 'pomodoro' | 'deep', rounds: number, lengths: TimerLengths = DEFAULT_LENGTHS): number {
  return Math.max(1, Math.round(rounds)) * lengths[mode].work
}

export interface TimerView {
  /** The phase running now; null once the schedule is over. */
  phase: Phase | null
  /** Its position in the schedule (the number of phases once it's over): it goes up when a phase ends. */
  index: number
  /** 1-based number of the current focus stretch, and how many there are. */
  round: number
  rounds: number
  /** Seconds left in the current phase. */
  phaseLeft: number
  /** Seconds of focus so far: breaks and pauses don't count. */
  focused: number
  /** Seconds of focus the schedule has in all. */
  plannedFocus: number
  paused: boolean
  done: boolean
}

/** Milliseconds paused up to `now`. */
export function pausedMs(pauses: Pause[], now: Date): number {
  return pauses.reduce((sum, pause) => {
    const from = Date.parse(pause.from)
    const to = Math.min(pause.to ? Date.parse(pause.to) : now.getTime(), now.getTime())
    return sum + Math.max(0, to - from)
  }, 0)
}

/** The pauses with a new one starting at `at` (nothing changes when already paused). */
export function pauseAt(pauses: Pause[], at: Date): Pause[] {
  if (pauses.some((pause) => pause.to === null)) return pauses
  return [...pauses, { from: at.toISOString(), to: null }]
}

/** The pauses with the running one ended at `at`. */
export function resumeAt(pauses: Pause[], at: Date): Pause[] {
  return pauses.map((pause) => (pause.to === null ? { ...pause, to: at.toISOString() } : pause))
}

/** Where the timer is at `now`. */
export function timerAt(phases: Phase[], startedAt: string, pauses: Pause[], now: Date): TimerView {
  const active = Math.max(0, (now.getTime() - Date.parse(startedAt) - pausedMs(pauses, now)) / 1000)
  const rounds = phases.filter((phase) => phase.kind === 'work').length
  const plannedFocus = phases.filter((phase) => phase.kind === 'work').reduce((sum, phase) => sum + phase.minutes * 60, 0)
  const paused = pauses.some((pause) => pause.to === null)

  let start = 0
  let focused = 0
  let round = 0
  for (const [index, phase] of phases.entries()) {
    const length = phase.minutes * 60
    if (phase.kind === 'work') round += 1
    if (active < start + length) {
      if (phase.kind === 'work') focused += active - start
      return {
        phase,
        index,
        round: Math.max(1, round),
        rounds,
        phaseLeft: Math.ceil(start + length - active),
        focused: Math.floor(focused),
        plannedFocus,
        paused,
        done: false,
      }
    }
    if (phase.kind === 'work') focused += length
    start += length
  }
  return { phase: null, index: phases.length, round: rounds, rounds, phaseLeft: 0, focused: plannedFocus, plannedFocus, paused, done: true }
}

/** What the timer is doing, in words: "Focus 1 of 2", "Break", "Paused" or "Time's up". */
export function phaseLabel(view: TimerView): string {
  if (view.done) return "Time's up"
  if (view.paused) return 'Paused'
  if (view.phase?.kind === 'break') return 'Break'
  return view.rounds > 1 ? `Focus ${view.round} of ${view.rounds}` : 'Focus'
}

/** "12:05" for seconds; hours become minutes ("75:00"). */
export function clockLabel(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
