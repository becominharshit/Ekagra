// Modes: what your plan says you should be doing right now.
// Sections: the 5 bottom tabs.
// Everything in this file is a plain function or constant (no React), so it is easy to test.

export type Mode = 'study' | 'hustle' | 'life' | 'free'
export type Section = 'today' | 'academics' | 'hustle' | 'life' | 'me'

/** One block of the plan, e.g. "DBMS revision, 4–5 PM, Study" (made from a saved plan block, see currentBlock.ts). */
export interface ScheduledBlock {
  id: string
  mode: Exclude<Mode, 'free'>
  title: string
  startsAt: string // ISO timestamp (UTC)
  endsAt: string // ISO timestamp (UTC)
}

export const SECTIONS: readonly Section[] = ['today', 'academics', 'hustle', 'life', 'me']

/** Which mode each tab belongs to. Today and Me are neutral: always fine to open. */
export const SECTION_MODE: Record<Section, Mode | null> = {
  today: null,
  academics: 'study',
  hustle: 'hustle',
  life: 'life',
  me: null,
}

export const MODE_LABEL: Record<Mode, string> = {
  study: 'Study',
  hustle: 'Hustle',
  life: 'Life',
  free: 'Free',
}

/** Tailwind classes for each mode's colour (defined in src/index.css). */
export const MODE_TONE: Record<Mode, string> = {
  study: 'bg-mode-study/15 text-mode-study ring-mode-study/30',
  hustle: 'bg-mode-hustle/15 text-mode-hustle ring-mode-hustle/30',
  life: 'bg-mode-life/15 text-mode-life ring-mode-life/30',
  free: 'bg-mode-free/10 text-mode-free ring-mode-free/25',
}

/** The tab a URL belongs to: "/hustle/clients" → "hustle". Unknown URLs → null. */
export function sectionFromPath(pathname: string): Section | null {
  const first = pathname.split('/').find((part) => part !== '')
  return SECTIONS.find((section) => section === first) ?? null
}

/** The block if it is running at `now` (start included, end excluded), otherwise null. */
export function activeBlock(block: ScheduledBlock | null, now: Date): ScheduledBlock | null {
  if (!block) return null
  const t = now.getTime()
  return t >= Date.parse(block.startsAt) && t < Date.parse(block.endsAt) ? block : null
}

/** What the plan says right now: the running block's mode, or "free". */
export function currentMode(block: ScheduledBlock | null, now: Date): Mode {
  return activeBlock(block, now)?.mode ?? 'free'
}

// Only Study and Hustle compete with each other (Academics tab vs Hustle tab).
const GUARDED_MODES: ReadonlySet<Mode> = new Set<Mode>(['study', 'hustle'])

export interface SwitchCheck {
  block: ScheduledBlock | null
  now: Date
  fromPath: string
  toPath: string
  /** Blocks where you already confirmed a switch; we ask only once per block. */
  acknowledgedBlockIds: readonly string[]
}

/**
 * Should we warn before this navigation?
 * Yes only when a Study block is running and you open the Hustle tab,
 * or a Hustle block is running and you open the Academics tab,
 * and you haven't already confirmed a switch during this block.
 */
export function needsSwitchWarning({ block, now, fromPath, toPath, acknowledgedBlockIds }: SwitchCheck): boolean {
  const active = activeBlock(block, now)
  if (!active || !GUARDED_MODES.has(active.mode)) return false

  const toSection = sectionFromPath(toPath)
  const toMode = toSection ? SECTION_MODE[toSection] : null
  if (!toMode || !GUARDED_MODES.has(toMode) || toMode === active.mode) return false

  // Moving around inside the same tab (e.g. /hustle → /hustle/clients) is fine.
  if (sectionFromPath(fromPath) === toSection) return false

  return !acknowledgedBlockIds.includes(active.id)
}

export type SwitchReason = 'done_early' | 'urgent' | 'break' | 'other'

export const SWITCH_REASONS: readonly { value: SwitchReason; label: string }[] = [
  { value: 'done_early', label: 'Done early' },
  { value: 'urgent', label: 'Urgent work' },
  { value: 'break', label: 'Taking a break' },
  { value: 'other', label: 'Other' },
]

/** A confirmed switch, saved to distraction_events (kind = 'mode_switch', from_mode, to_mode, reason). */
export interface ModeSwitchEvent {
  blockId: string
  fromMode: Mode
  toMode: Mode
  reason: SwitchReason
  at: string // ISO timestamp
}
