import { useEffect, useState } from 'react'

/**
 * The current time, refreshed every `intervalMs` (default 30 seconds) and whenever the
 * app comes back to the screen, so time-based UI (like the Mode Chip) updates by itself.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const tick = () => setNow(new Date())
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    const id = window.setInterval(tick, intervalMs)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs])

  return now
}
