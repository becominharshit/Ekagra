import { useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useBlocker } from 'react-router'
import { need, useDataSource } from '@/lib/dataSource'
import { useCurrentBlock } from './currentBlock'
import { ModeSwitchDialog } from './ModeSwitchDialog'
import { needsSwitchWarning, SECTION_MODE, sectionFromPath, type ModeSwitchEvent, type SwitchReason } from './modes'
import { saveModeSwitch } from './modeSwitches'
import { useModeStore } from './modeStore'

/**
 * Watches every navigation inside the app (tab taps, links, the back button).
 * If it goes against the plan (Hustle during Study, Academics during Hustle), React Router's
 * useBlocker pauses it and we show the warning: "Stay" cancels the navigation,
 * "Switch" saves the reason (as a distraction event) and lets it continue.
 */
export function ModeSwitchGuard() {
  const { block } = useCurrentBlock()
  const { source } = useDataSource()
  const acknowledgedBlockIds = useModeStore((state) => state.acknowledgedBlockIds)
  const acknowledge = useModeStore((state) => state.acknowledge)
  const save = useMutation({
    mutationFn: (event: ModeSwitchEvent) => saveModeSwitch(need(source), event),
    // The switch itself already happened; a failed save is only logged.
    onError: (error) => console.error('Could not save the mode switch:', error),
  })

  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    needsSwitchWarning({
      block,
      now: new Date(),
      fromPath: currentLocation.pathname,
      toPath: nextLocation.pathname,
      acknowledgedBlockIds,
    }),
  )

  // The tab the paused navigation wants to open, and its mode.
  const nextSection = blocker.location ? sectionFromPath(blocker.location.pathname) : null
  const toMode = nextSection ? SECTION_MODE[nextSection] : null
  const showWarning = blocker.state === 'blocked' && block !== null && toMode !== null

  // Safety net: a paused navigation with nothing to warn about is let through,
  // so the app can never get stuck.
  useEffect(() => {
    if (blocker.state === 'blocked' && (block === null || toMode === null)) blocker.proceed()
  }, [blocker, block, toMode])

  function stay() {
    if (blocker.state === 'blocked') blocker.reset()
  }

  function switchAnyway(reason: SwitchReason) {
    if (blocker.state !== 'blocked' || !block || !toMode) return
    acknowledge(block.id)
    save.mutate({ blockId: block.id, fromMode: block.mode, toMode, reason, at: new Date().toISOString() })
    blocker.proceed()
  }

  return <ModeSwitchDialog open={showWarning} block={block} toMode={toMode} onStay={stay} onSwitch={switchAnyway} />
}
