import { Check, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCaptureStore } from '@/features/tasks/captureStore'
import { dueLabel, isOpenTask } from '@/features/tasks/taskRules'
import { setTaskDone, useTaskMutation, useTasks } from '@/features/tasks/tasks'
import { useNow } from '@/hooks/useNow'
import { cn } from '@/lib/utils'
import type { Hustle } from './hustles'

/** A hustle's open tasks (captured with the + button), with one tap to tick them off. */
export function HustleTasks({ hustle }: { hustle: Hustle }) {
  const now = useNow(60_000)
  const tasks = useTasks()
  const toggle = useTaskMutation(setTaskDone)
  const openCapture = useCaptureStore((state) => state.setOpen)
  const open = (tasks.data ?? []).filter((task) => task.hustle_id === hustle.id && isOpenTask(task))

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Tasks</CardTitle>
        <CardDescription>{open.length === 0 ? 'No open tasks. Capture one with +, e.g. "Send the invoice Friday".' : `${open.length} open`}</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" onClick={() => openCapture(true)}>
            <Plus aria-hidden />
            Capture
          </Button>
        </CardAction>
      </CardHeader>
      {open.length > 0 && (
        <CardContent>
          <ul className="grid gap-2">
            {open.map((task) => {
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
                  <span className="min-w-0 flex-1 truncate">{task.title}</span>
                  <span className={cn('shrink-0 text-xs', overdue ? 'font-medium text-destructive' : 'text-muted-foreground')}>{dueLabel(task.due_at, now)}</span>
                </li>
              )
            })}
          </ul>
        </CardContent>
      )}
    </Card>
  )
}
