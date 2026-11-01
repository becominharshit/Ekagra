import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import type { PlanBlock } from '@/features/planner/schedule'

/** Where to do a block's work: the topic's lesson, the hustle, the tasks or the review session. */
export function WorkLink({ block }: { block: PlanBlock }) {
  if (block.kind === 'learn' && block.topic_id) {
    return (
      <Button asChild variant="link" className="h-auto justify-self-start p-0">
        <Link to={`/academics/topics/${block.topic_id}`}>Open the topic: lesson, quiz, flashcards</Link>
      </Button>
    )
  }
  if (block.hustle_id && (block.kind === 'hustle' || block.kind === 'task')) {
    return (
      <Button asChild variant="link" className="h-auto justify-self-start p-0">
        <Link to={`/hustle/${block.hustle_id}`}>Open the hustle: board, money and time</Link>
      </Button>
    )
  }
  if (block.kind === 'task') {
    return (
      <Button asChild variant="link" className="h-auto justify-self-start p-0">
        <Link to="/today/tasks">Your tasks</Link>
      </Button>
    )
  }
  if (block.kind === 'review') {
    return (
      <div className="flex flex-wrap gap-x-4">
        <Button asChild variant="link" className="h-auto p-0">
          <Link to="/academics/review">Review flashcards</Link>
        </Button>
        <Button asChild variant="link" className="h-auto p-0">
          <Link to="/academics/mistakes">Mistake notebook</Link>
        </Button>
      </div>
    )
  }
  return null
}
