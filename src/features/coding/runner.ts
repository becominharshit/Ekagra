import { useCallback, useState } from 'react'
import type { JsWorkerMessage } from './jsRuntime'
import { LANGUAGE_SPECS, type CodingLanguage } from './languages'
import type { RunRequest, RunResult, WorkerMessage } from './python'
import type { SqlWorkerMessage } from './sql'

// Web Worker manager for the Coding Lab. Keeps one persistent worker per runtime family
// (Python/Pyodide, JS/TS, SQL/PGlite). Any run exceeding 10 seconds terminates its worker
// cleanly to stop infinite loops; the next run respawns the worker cleanly from cache.

export type RunnerStatus = 'idle' | 'loading' | 'running'

export const RUN_LIMIT_SECONDS = 10
const PYODIDE_LOAD_LIMIT_MS = 60_000
const LOCAL_RUNTIME_LOAD_LIMIT_MS = 30_000
const PYODIDE_LOAD_FAILED =
  "Couldn't download Python. The first run needs the internet (about 13 MB); after that it works offline."
const LOCAL_LOAD_FAILED = "Couldn't start the sandboxed runtime on this device. Please try again."

type RuntimeKind = 'python' | 'js' | 'sql'
type AnyWorkerMessage = WorkerMessage | JsWorkerMessage | SqlWorkerMessage

interface RuntimeSlot {
  worker: Worker | null
  ready: Promise<void> | null
  loading: { reject: (error: Error) => void; timer: number } | null
  pending: { id: number; resolve: (result: RunResult) => void; timer: number } | null
  nextId: number
}

function createSlot(): RuntimeSlot {
  return { worker: null, ready: null, loading: null, pending: null, nextId: 1 }
}

const slots: Record<RuntimeKind, RuntimeSlot> = {
  python: createSlot(),
  js: createSlot(),
  sql: createSlot(),
}

function runtimeFor(language: CodingLanguage): RuntimeKind {
  if (language === 'javascript' || language === 'typescript') return 'js'
  if (language === 'sql') return 'sql'
  return 'python'
}

function endSlot(kind: RuntimeKind, message: string): void {
  const slot = slots[kind]
  slot.worker?.terminate()
  slot.worker = null
  slot.ready = null
  if (slot.loading) {
    window.clearTimeout(slot.loading.timer)
    slot.loading.reject(new Error(message))
    slot.loading = null
  }
  if (slot.pending) {
    window.clearTimeout(slot.pending.timer)
    slot.pending.resolve({ output: '', error: message, tests: [], durationMs: 0 })
    slot.pending = null
  }
}

function spawnWorker(kind: RuntimeKind): Worker {
  if (kind === 'js') return new Worker(new URL('./js.worker.ts', import.meta.url), { type: 'module' })
  if (kind === 'sql') return new Worker(new URL('./sql.worker.ts', import.meta.url), { type: 'module' })
  return new Worker(new URL('./python.worker.ts', import.meta.url), { type: 'module' })
}

function startSlot(kind: RuntimeKind): Promise<void> {
  const slot = slots[kind]
  if (slot.ready) return slot.ready

  const loadFailedMsg = kind === 'python' ? PYODIDE_LOAD_FAILED : LOCAL_LOAD_FAILED
  const loadLimitMs = kind === 'python' ? PYODIDE_LOAD_LIMIT_MS : LOCAL_RUNTIME_LOAD_LIMIT_MS
  const created = spawnWorker(kind)
  slot.worker = created

  slot.ready = new Promise<void>((resolve, reject) => {
    slot.loading = { reject, timer: window.setTimeout(() => endSlot(kind, loadFailedMsg), loadLimitMs) }

    created.addEventListener('message', (event: MessageEvent<AnyWorkerMessage>) => {
      if (slot.worker !== created) return
      const message = event.data
      if (message.type === 'ready') {
        if (slot.loading) window.clearTimeout(slot.loading.timer)
        slot.loading = null
        resolve()
      } else if (message.type === 'load-error') {
        endSlot(kind, loadFailedMsg)
      } else if (slot.pending?.id === message.id) {
        window.clearTimeout(slot.pending.timer)
        slot.pending.resolve(message.result)
        slot.pending = null
      }
    })

    created.addEventListener('error', () => {
      if (slot.worker === created) {
        endSlot(kind, slot.loading ? loadFailedMsg : 'Runtime stopped unexpectedly. Please run it again.')
      }
    })
  })

  return slot.ready
}

export function runtimeReady(language: CodingLanguage): boolean {
  const slot = slots[runtimeFor(language)]
  return slot.ready !== null && slot.loading === null
}

/** True once Python has loaded (runs start right away). */
export function pythonReady(): boolean {
  return runtimeReady('python')
}

/** Runs code in the isolated worker for the given language. */
export async function runCode(
  language: CodingLanguage,
  request: RunRequest,
  onRunning?: () => void,
): Promise<RunResult> {
  const kind = runtimeFor(language)
  const slot = slots[kind]
  if (slot.pending) {
    return {
      output: '',
      error: `${LANGUAGE_SPECS[language].label} is still running the last program.`,
      tests: [],
      durationMs: 0,
    }
  }

  await startSlot(kind)
  onRunning?.()

  return new Promise<RunResult>((resolve) => {
    const id = slot.nextId++
    const timer = window.setTimeout(
      () => endSlot(kind, `Stopped after ${RUN_LIMIT_SECONDS} seconds. Is there an endless loop?`),
      RUN_LIMIT_SECONDS * 1000,
    )
    slot.pending = { id, resolve, timer }
    if (kind === 'js') {
      slot.worker?.postMessage({ id, language, ...request })
    } else {
      slot.worker?.postMessage({ id, ...request })
    }
  })
}

/** Stops the running or loading worker for the given language (or all runtimes if omitted). */
export function stopCode(language?: CodingLanguage): void {
  if (language) {
    endSlot(runtimeFor(language), 'Stopped.')
    return
  }
  endSlot('python', 'Stopped.')
  endSlot('js', 'Stopped.')
  endSlot('sql', 'Stopped.')
}

/** Runs code in the Python worker, loading Pyodide first if needed. */
export function runPython(request: RunRequest, onRunning?: () => void): Promise<RunResult> {
  return runCode('python', request, onRunning)
}

/** Stops the program that is running, or Python that is still loading. */
export function stopPython(): void {
  stopCode('python')
}

/** Multi-language Coding Lab runner hook with status and safe termination. */
export function useCodeRunner(language: CodingLanguage) {
  const [status, setStatus] = useState<RunnerStatus>('idle')

  const run = useCallback(
    async (request: RunRequest): Promise<RunResult> => {
      setStatus(runtimeReady(language) ? 'running' : 'loading')
      try {
        return await runCode(language, request, () => setStatus('running'))
      } finally {
        setStatus('idle')
      }
    },
    [language],
  )

  const stop = useCallback(() => {
    stopCode(language)
  }, [language])

  return { status, run, stop }
}

/** For Python-only callers: run, stop, and whether Python is loading or running. */
export function usePythonRunner() {
  return useCodeRunner('python')
}
