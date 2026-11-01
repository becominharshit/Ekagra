import type { FocusSession } from '@/features/focus/sessions'
import { blockAt, blocksAfter, type PlanBlock } from '@/features/planner/schedule'

// What the Now card shows. The focus sessions themselves are in src/features/focus/.

export type NowView =
  | { kind: 'focus'; session: FocusSession; block: PlanBlock | null }
  | { kind: 'block'; block: PlanBlock }
  | { kind: 'free'; next: PlanBlock | null }

const isOpen = (block: PlanBlock) => block.status === 'planned' || block.status === 'in_progress'

/** What the Now card shows: the focus session that is running, else the block of right now, else the next one. */
export function nowView(blocks: PlanBlock[], session: FocusSession | null, now: Date): NowView {
  if (session) return { kind: 'focus', session, block: blocks.find((block) => block.id === session.plan_block_id) ?? null }
  const open = blocks.filter(isOpen)
  const current = blockAt(open, now)
  if (current) return { kind: 'block', block: current }
  return { kind: 'free', next: blocksAfter(open, now, 1)[0] ?? null }
}

/** The next blocks after the one of right now. */
export function upNext(blocks: PlanBlock[], now: Date, count = 3): PlanBlock[] {
  return blocksAfter(blocks.filter(isOpen), now, count)
}
