import type { loadPyodide as LoadPyodide, PyodideAPI } from 'pyodide'
import { PYODIDE_INDEX_URL, runWithPyodide, type RunRequest, type WorkerMessage } from './python'

// A Web Worker: it runs Python on its own thread, so a long program never freezes the app.
// Pyodide comes from the CDN (not from our build): the first time it downloads about 13 MB, after
// that the browser (or the Android WebView) has it in its cache.

// The worker's global scope, typed by hand (the app's TypeScript settings describe a window).
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<RunRequest & { id: number }>) => void) | null
  postMessage(message: WorkerMessage): void
}

const pyodideReady: Promise<PyodideAPI> = (async () => {
  const module = (await import(/* @vite-ignore */ `${PYODIDE_INDEX_URL}pyodide.mjs`)) as { loadPyodide: typeof LoadPyodide }
  return module.loadPyodide({ indexURL: PYODIDE_INDEX_URL })
})()

pyodideReady.then(
  () => scope.postMessage({ type: 'ready' }),
  (error: unknown) => scope.postMessage({ type: 'load-error', message: error instanceof Error ? error.message : String(error) }),
)

scope.onmessage = async (event) => {
  const { id, ...request } = event.data
  try {
    const pyodide = await pyodideReady
    scope.postMessage({ type: 'result', id, result: await runWithPyodide(pyodide, request) })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    scope.postMessage({ type: 'result', id, result: { output: '', error: `Python stopped unexpectedly: ${message}`, tests: [], durationMs: 0 } })
  }
}
