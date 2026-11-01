import { useCallback, useState } from 'react'
import type { RunRequest, RunResult, WorkerMessage } from './python'

// The app's side of the Python worker. There is one worker for the whole app, so Python loads
// once and then stays ready. A run that takes longer than 10 seconds (an endless loop?) is
// stopped by ending the worker; the next run starts a new one (Python then comes from the cache).

export type RunnerStatus = 'idle' | 'loading' | 'running'

export const RUN_LIMIT_SECONDS = 10
const LOAD_LIMIT_MS = 3 * 60_000
const LOAD_FAILED = "Couldn't download Python. The first run needs the internet (about 13 MB); after that it works offline."

let worker: Worker | null = null
let ready: Promise<void> | null = null
let loading: { reject: (error: Error) => void; timer: number } | null = null
let pending: { id: number; resolve: (result: RunResult) => void; timer: number } | null = null
let nextId = 1

/** Ends the worker. Loading fails with `message`; a run in progress ends with it as its error. */
function endWorker(message: string): void {
  worker?.terminate()
  worker = null
  ready = null
  if (loading) {
    window.clearTimeout(loading.timer)
    loading.reject(new Error(message))
    loading = null
  }
  if (pending) {
    window.clearTimeout(pending.timer)
    pending.resolve({ output: '', error: message, tests: [], durationMs: 0 })
    pending = null
  }
}

function startWorker(): Promise<void> {
  if (ready) return ready
  const created = new Worker(new URL('./python.worker.ts', import.meta.url), { type: 'module' })
  worker = created
  ready = new Promise<void>((resolve, reject) => {
    loading = { reject, timer: window.setTimeout(() => endWorker(LOAD_FAILED), LOAD_LIMIT_MS) }
    created.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
      if (worker !== created) return
      const message = event.data
      if (message.type === 'ready') {
        if (loading) window.clearTimeout(loading.timer)
        loading = null
        resolve()
      } else if (message.type === 'load-error') {
        endWorker(LOAD_FAILED)
      } else if (pending?.id === message.id) {
        window.clearTimeout(pending.timer)
        pending.resolve(message.result)
        pending = null
      }
    })
    created.addEventListener('error', () => {
      if (worker === created) endWorker(loading ? LOAD_FAILED : 'Python stopped unexpectedly. Please run it again.')
    })
  })
  return ready
}

/** True once Python has loaded (runs start right away). */
export function pythonReady(): boolean {
  return ready !== null && loading === null
}

/** Runs code in the worker, loading Python first if needed. Throws if Python can't be loaded. */
export async function runPython(request: RunRequest, onRunning?: () => void): Promise<RunResult> {
  if (pending) return { output: '', error: 'Python is still running the last program.', tests: [], durationMs: 0 }
  await startWorker()
  onRunning?.()
  return new Promise<RunResult>((resolve) => {
    const id = nextId++
    const timer = window.setTimeout(
      () => endWorker(`Stopped after ${RUN_LIMIT_SECONDS} seconds. Is there an endless loop?`),
      RUN_LIMIT_SECONDS * 1000,
    )
    pending = { id, resolve, timer }
    worker?.postMessage({ id, ...request })
  })
}

/** Stops the program that is running, or Python that is still loading. */
export function stopPython(): void {
  endWorker('Stopped.')
}

/** For screens: run, stop, and whether Python is loading or running. */
export function usePythonRunner() {
  const [status, setStatus] = useState<RunnerStatus>('idle')
  const run = useCallback(async (request: RunRequest): Promise<RunResult> => {
    setStatus(pythonReady() ? 'running' : 'loading')
    try {
      return await runPython(request, () => setStatus('running'))
    } finally {
      setStatus('idle')
    }
  }, [])
  return { status, run, stop: stopPython }
}
