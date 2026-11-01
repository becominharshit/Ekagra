import { DefaultScheduler } from 'ts-fsrs'
import type { Scheduler } from './fsrs'

// Making the FSRS scheduler needs the ts-fsrs library (about 50 KB). It lives in this file so the
// app only downloads it when cards are reviewed: `await import('./scheduler')`.
//
// New cards first come back after 1 and 10 minutes (learning steps); a forgotten card after 10 minutes.

function createScheduler(retention: number, fuzz: boolean): Promise<Scheduler> {
  return DefaultScheduler({
    desiredRetention: retention,
    enableFuzz: fuzz,
    enableShortTerm: true,
    learningSteps: ['1m', '10m'],
    relearningSteps: ['10m'],
    // Keep the learning steps above instead of FSRS-7's own short-term timing.
    allowModelOverride: false,
    // A student's horizon: nothing waits longer than a year.
    maximumInterval: 365,
  })
}

const schedulers = new Map<string, Promise<Scheduler>>()

/**
 * The scheduler for a target retention (0.9 = remember 90% of cards when they come back).
 * Made once and reused. `fuzz` spreads reviews a little so they don't all land on one day.
 */
export function getScheduler(retention = 0.9, fuzz = true): Promise<Scheduler> {
  const key = `${retention}:${fuzz}`
  let scheduler = schedulers.get(key)
  if (!scheduler) {
    scheduler = createScheduler(retention, fuzz)
    schedulers.set(key, scheduler)
  }
  return scheduler
}
