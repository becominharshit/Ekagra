import { Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNow } from '@/hooks/useNow'
import { cn } from '@/lib/utils'
import { useHustleMutation } from './hustles'
import { finishLaunch, secondsLeft, type ActiveLaunch } from './launchpad'
import { useLaunchpadStore } from './launchpadStore'

/** The running Launchpad session, on every screen: time left, then "Did you do it?". */
export function LaunchpadBar() {
  const active = useLaunchpadStore((state) => state.active)
  return active ? <RunningLaunch launch={active} /> : null
}

function RunningLaunch({ launch }: { launch: ActiveLaunch }) {
  const now = useNow(1000)
  const extend = useLaunchpadStore((state) => state.extend)
  const clear = useLaunchpadStore((state) => state.clear)
  const finish = useHustleMutation(finishLaunch)
  const left = secondsLeft(launch, now)
  const over = left <= 0
  const clock = `${Math.floor(Math.max(0, left) / 60)}:${String(Math.max(0, left) % 60).padStart(2, '0')}`
  const goal = launch.intention.charAt(0).toLowerCase() + launch.intention.slice(1)
  const end = (did: boolean) => finish.mutate({ launch, did }, { onSuccess: clear })

  return (
    <div role="status" className={cn('border-b px-4 py-2 text-sm', over ? 'bg-amber-500/15' : 'bg-primary/5')}>
      <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-x-3 gap-y-1.5">
        <Rocket className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          {over ? (
            <>
              Time's up on {launch.platform}. Did you {goal}?
            </>
          ) : (
            <>
              <span className="font-medium">{launch.platform}</span>: {launch.intention} · <span className="tabular-nums">{clock}</span> left
            </>
          )}
        </span>
        <span className="flex gap-1">
          {over ? (
            <>
              <Button size="xs" disabled={finish.isPending} onClick={() => end(true)}>
                Yes
              </Button>
              <Button size="xs" variant="outline" disabled={finish.isPending} onClick={() => extend(5)}>
                5 more min
              </Button>
              <Button size="xs" variant="ghost" disabled={finish.isPending} onClick={() => end(false)}>
                No
              </Button>
            </>
          ) : (
            <>
              <Button size="xs" disabled={finish.isPending} onClick={() => end(true)}>
                Done
              </Button>
              <Button size="xs" variant="ghost" disabled={finish.isPending} onClick={() => end(false)}>
                Stop
              </Button>
            </>
          )}
        </span>
      </div>
      {finish.error && (
        <p role="alert" className="mx-auto mt-1 max-w-2xl text-xs text-destructive">
          {finish.error.message}
        </p>
      )}
    </div>
  )
}
