import { endOfDay } from 'date-fns'
import { Check, Layers, ListTodo, NotebookPen } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { countLabel } from '@/features/academics/labels'
import { useSubjects } from '@/features/academics/subjects'
import { todaysQueue, useFlashcards, useReviewsToday } from '@/features/flashcards/flashcards'
import { useHustles } from '@/features/hustle/hustles'
import { dueMistakes } from '@/features/mistakes/ladder'
import { useMistakes } from '@/features/mistakes/mistakes'
import { useProfile } from '@/features/profile/queries'
import { readSettings } from '@/features/profile/settings'
import { dueLabel, dueSoon } from '@/features/tasks/taskRules'
import { setTaskDone, useTaskMutation, useTasks } from '@/features/tasks/tasks'
import { useNow } from '@/hooks/useNow'
import { cn } from '@/lib/utils'

/** What's coming up: tasks due in the next 72 hours, and flashcards and mistakes to review today. */
export function DueSoon() {
  const now = useNow(60_000)
  const tasks = useTasks()
  const subjects = useSubjects()
  const hustles = useHustles()
  const toggle = useTaskMutation(setTaskDone)
  const cards = useFlashcards()
  const reviews = useReviewsToday(now)
  const mistakes = useMistakes()
  const profile = useProfile()
  const newPerDay = readSettings(profile.data?.settings).learning.newCardsPerDay

  const soon = dueSoon(tasks.data ?? [], now)
  const cardsDue = cards.data && reviews.data ? todaysQueue(cards.data, reviews.data, newPerDay, now).length : 0
  const mistakesDue = mistakes.data ? dueMistakes(mistakes.data, endOfDay(now)).length : 0

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Due soon</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {soon.length === 0 ? (
          <p className="text-sm text-muted-foreground">No deadlines in the next 3 days.</p>
        ) : (
          <ul className="grid gap-2">
            {soon.map((task) => {
              const subject = subjects.data?.find((row) => row.id === task.subject_id)
              const belongsTo = subject ? (subject.code ?? subject.name) : hustles.data?.find((row) => row.id === task.hustle_id)?.name
              const overdue = task.due_at !== null && Date.parse(task.due_at) < now.getTime()
              return (
                <li key={task.id} className="flex items-center gap-2 text-sm">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-6 shrink-0 rounded-full"
                    aria-label={`Mark "${task.title}" done`}
                    disabled={toggle.isPending}
                    onClick={() => toggle.mutate({ task, done: true })}
                  >
                    <Check className="size-3" aria-hidden />
                  </Button>
                  <span className="min-w-0 flex-1 truncate">
                    {task.title}
                    {belongsTo && <span className="text-muted-foreground"> · {belongsTo}</span>}
                  </span>
                  <span className={cn('shrink-0 text-xs', overdue ? 'font-medium text-destructive' : 'text-muted-foreground')}>{dueLabel(task.due_at, now)}</span>
                </li>
              )
            })}
          </ul>
        )}
        {(cardsDue > 0 || mistakesDue > 0) && (
          <p className="text-sm">
            Reviews waiting:{' '}
            {[cardsDue > 0 ? countLabel(cardsDue, 'flashcard') : null, mistakesDue > 0 ? countLabel(mistakesDue, 'mistake') : null].filter(Boolean).join(' · ')}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/today/tasks">
              <ListTodo aria-hidden />
              All tasks
            </Link>
          </Button>
          {cardsDue > 0 && (
            <Button asChild size="sm" variant="outline">
              <Link to="/academics/review">
                <Layers aria-hidden />
                Review cards
              </Link>
            </Button>
          )}
          {mistakesDue > 0 && (
            <Button asChild size="sm" variant="outline">
              <Link to="/academics/mistakes">
                <NotebookPen aria-hidden />
                Mistakes
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
