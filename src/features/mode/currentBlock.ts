import { useBlocks } from '@/features/planner/planBlocks'
import { blockAt, blockMode, localDateOf, type PlanBlock } from '@/features/planner/schedule'
import { useNow } from '@/hooks/useNow'
import type { ScheduledBlock } from './modes'

// What the plan says right now, from today's saved plan (plan_blocks).

/** A saved plan block as the block the Mode Chip and the switch warning work with. */
export function toScheduledBlock(block: Pick<PlanBlock, 'id' | 'area' | 'title' | 'start_at' | 'end_at'>): ScheduledBlock {
  return { id: block.id, mode: blockMode(block.area), title: block.title, startsAt: block.start_at, endsAt: block.end_at }
}

/** Blocks that still hold you to their mode: not done, partly done or skipped yet. */
export function stillOpen(block: Pick<PlanBlock, 'status'>): boolean {
  return block.status === 'planned' || block.status === 'in_progress'
}

/** The plan block running now (one you finished early or skipped frees you), and the time it was checked. */
export function useCurrentBlock(intervalMs = 30_000): { block: ScheduledBlock | null; row: PlanBlock | null; now: Date } {
  const now = useNow(intervalMs)
  const today = localDateOf(now)
  const blocks = useBlocks(today, today)
  const row = blockAt((blocks.data ?? []).filter(stillOpen), now)
  return { block: row ? toScheduledBlock(row) : null, row, now }
}
