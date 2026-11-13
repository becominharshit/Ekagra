import type { Topic } from '@/features/academics/topicTree'
import type { PlanBlock } from '@/features/planner/schedule'

// "I have X minutes" on Today: picks the single highest-value action that fits in a spare
// 10, 20, 30 or 45-minute gap between classes. Pure function, tested on its own.

export const QUICK_WIN_MINUTES = [10, 20, 30, 45] as const
export type QuickWinMinutes = (typeof QUICK_WIN_MINUTES)[number]

export interface QuickWinInput {
  dueCards: number
  dueMistakes: number
  blocks: Pick<PlanBlock, 'id' | 'title' | 'status' | 'planned_minutes' | 'actual_minutes' | 'start_at'>[]
  topics: Pick<Topic, 'id' | 'title' | 'parent_id' | 'status' | 'priority_score' | 'est_minutes'>[]
}

export interface QuickWinSuggestion {
  title: string
  detail: string
  actionLabel: string
  to: string
}

/** Picks the best single action that fits in `minutes`. */
export function pickQuickWin(minutes: QuickWinMinutes, { dueCards, dueMistakes, blocks, topics }: QuickWinInput): QuickWinSuggestion {
  if (minutes <= 20 && dueCards > 0) {
    const count = Math.min(dueCards, minutes * 2)
    return {
      title: `Review ${count} due ${count === 1 ? 'flashcard' : 'flashcards'}`,
      detail: `${dueCards} ${dueCards === 1 ? 'card is' : 'cards are'} due for spaced repetition right now.`,
      actionLabel: 'Review cards',
      to: '/academics/flashcards',
    }
  }

  if (minutes <= 25 && dueMistakes > 0) {
    return {
      title: `Clear ${dueMistakes} open ${dueMistakes === 1 ? 'mistake' : 'mistakes'}`,
      detail: 'Review due mistakes with adaptive FSRS spaced repetition while you have a short break.',
      actionLabel: 'Open mistakes',
      to: '/academics/mistakes',
    }
  }

  const openBlocks = blocks
    .filter((block) => block.status === 'planned' || block.status === 'in_progress')
    .sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at))
  const fittingBlock = openBlocks.find((block) => block.planned_minutes - (block.actual_minutes ?? 0) <= minutes + 10) ?? (minutes >= 20 ? openBlocks[0] : undefined)
  if (fittingBlock) {
    const left = Math.max(5, fittingBlock.planned_minutes - (fittingBlock.actual_minutes ?? 0))
    return {
      title: fittingBlock.title,
      detail: `${Math.min(minutes, left)} min focus sprint on today's planned block (${left} min left).`,
      actionLabel: 'Start focus',
      to: `/today/focus?block=${fittingBlock.id}`,
    }
  }

  const leaves = topics
    .filter((topic) => topic.parent_id !== null && topic.status !== 'mastered')
    .sort((a, b) => Number(b.priority_score) - Number(a.priority_score))
  const fittingTopic = leaves.find((topic) => (topic.est_minutes ?? 30) <= minutes + 15) ?? leaves[0]
  if (fittingTopic) {
    return {
      title: `Study: ${fittingTopic.title}`,
      detail: `High-priority topic${fittingTopic.est_minutes ? ` (~${fittingTopic.est_minutes} min)` : ''} — read the lesson or take the check quiz.`,
      actionLabel: 'Open topic',
      to: `/academics/topics/${fittingTopic.id}`,
    }
  }

  if (dueCards > 0) {
    return {
      title: `Review ${dueCards} due ${dueCards === 1 ? 'flashcard' : 'flashcards'}`,
      detail: 'Keep your retention streak going.',
      actionLabel: 'Review cards',
      to: '/academics/flashcards',
    }
  }

  if (dueMistakes > 0) {
    return {
      title: `Review ${dueMistakes} open ${dueMistakes === 1 ? 'mistake' : 'mistakes'}`,
      detail: 'Turn past errors into mastered concepts.',
      actionLabel: 'Open mistakes',
      to: '/academics/mistakes',
    }
  }

  return {
    title: `${minutes}-minute focus sprint`,
    detail: 'No cards or blocks are waiting — start a quick timer on any subject or task.',
    actionLabel: 'Open timer',
    to: '/today/focus',
  }
}
