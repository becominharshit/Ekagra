import type { PyodideAPI } from 'pyodide'
import type { CodeTest } from '@shared/schemas.ts'

// Running Python with Pyodide (Python compiled to WebAssembly, so it runs inside the app, with no
// server). This file has the parts that work with any Pyodide: the worker (python.worker.ts) uses
// them in the app, and the tests use them with the real Pyodide in Node.

/** Must match the "pyodide" version in package.json (a test checks it). */
export const PYODIDE_VERSION = '314.0.7'
/** Pyodide is downloaded from this CDN the first time (about 13 MB), then the browser keeps it. */
export const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

export interface RunRequest {
  code: string
  /** The problem's tests (empty for a free file). */
  tests: CodeTest[]
  /** What the program reads with input(), one line per call. */
  input: string
}

export interface TestResult extends CodeTest {
  passed: boolean
  /** What the student's code gave (Python repr), when it gave something. */
  actual: string | null
  error: string | null
}

export interface RunResult {
  /** Everything the program printed. */
  output: string
  /** The error that stopped the program, if any (a short traceback). */
  error: string | null
  /** One result per test; empty when there are no tests or the program crashed first. */
  tests: TestResult[]
  durationMs: number
}

/** Messages from the worker to the app. */
export type WorkerMessage =
  | { type: 'ready' }
  | { type: 'load-error'; message: string }
  | { type: 'result'; id: number; result: RunResult }

const MAX_OUTPUT = 20_000

// Runs each test in the namespace the student's code ran in: `actual == expected`, where both
// are Python expressions. Errors in one test don't stop the others.
const CHECK_TESTS = `
import json

def _ekagra_check(cases, ns):
    results = []
    for case in cases:
        try:
            actual = eval(case["call"], ns)
        except Exception as error:
            results.append({"passed": False, "actual": None, "error": f"{type(error).__name__}: {error}"})
            continue
        shown = repr(actual)
        shown = shown if len(shown) <= 300 else shown[:300] + "…"
        try:
            expected = eval(case["expected"], {})
            passed = bool(actual == expected)
        except Exception as error:
            results.append({"passed": False, "actual": shown, "error": f"{type(error).__name__}: {error}"})
            continue
        results.append({"passed": passed, "actual": shown, "error": None})
    return results

json.dumps(_ekagra_check(json.loads(_cases_json), _ns))
`

/**
 * Pyodide's tracebacks start with its own internal frames. Keeps only the student's code
 * ("<exec>"), written as "Line 3" instead of 'File "<exec>", line 3'.
 */
export function cleanTraceback(message: string): string {
  const lines = message.trimEnd().split('\n')
  const first = lines.findIndex((line) => line.includes('File "<exec>"'))
  // No line of the student's code involved: the last line says what went wrong.
  if (first === -1) return lines.at(-1) ?? message
  const frames = lines.slice(first).map((line) => line.replace(/File "<exec>", line (\d+)/, 'Line $1'))
  return lines[0]?.startsWith('Traceback') ? ['Traceback (most recent call last):', ...frames].join('\n') : frames.join('\n')
}

/** Runs the student's code (and the tests, if it ran without an error) in a fresh namespace. */
export async function runWithPyodide(pyodide: PyodideAPI, request: RunRequest): Promise<RunResult> {
  const started = performance.now()
  // The output is collected like a terminal shows it: exactly what Python writes (also half
  // lines, like an input() prompt), with each input line shown after its prompt.
  let output = ''
  const append = (text: string) => {
    if (output.length < MAX_OUTPUT) output += text
  }
  const decoder = new TextDecoder()
  const writer = {
    write(buffer: Uint8Array) {
      append(decoder.decode(buffer, { stream: true }))
      return buffer.length
    },
  }
  pyodide.setStdout(writer)
  pyodide.setStderr(writer)
  const lines = request.input === '' ? [] : request.input.split(/\r?\n/)
  pyodide.setStdin({
    stdin: () => {
      const line = lines.shift()
      if (line === undefined) return null // no more input: input() raises EOFError
      append(`${line}\n`)
      return line
    },
  })

  const namespace = pyodide.globals.get('dict')()
  const harness = pyodide.globals.get('dict')()
  try {
    let error: string | null = null
    try {
      // Packages that aren't built in (e.g. numpy) are downloaded the first time they're imported.
      await pyodide.loadPackagesFromImports(request.code)
      await pyodide.runPythonAsync(request.code, { globals: namespace })
    } catch (caught) {
      error = cleanTraceback(caught instanceof Error ? caught.message : String(caught))
    }

    let tests: TestResult[] = []
    if (error === null && request.tests.length > 0) {
      harness.set('_ns', namespace)
      harness.set('_cases_json', JSON.stringify(request.tests))
      const json = (await pyodide.runPythonAsync(CHECK_TESTS, { globals: harness })) as string
      const results = JSON.parse(json) as Omit<TestResult, keyof CodeTest>[]
      tests = request.tests.map((test, index) => ({ ...test, passed: false, actual: null, error: null, ...results[index] }))
    }

    // A last line without a newline (print(x, end="")) is still waiting in Python's buffer.
    await pyodide.runPythonAsync('import sys\nsys.stdout.flush()\nsys.stderr.flush()')
    if (output.length >= MAX_OUTPUT) output = `${output.slice(0, MAX_OUTPUT)}\n… (the rest of the output is cut)`
    return { output: output.replace(/\n$/, ''), error, tests, durationMs: Math.round(performance.now() - started) }
  } finally {
    namespace.destroy()
    harness.destroy()
  }
}

/** True when the run had tests and every one passed. */
export function allPassed(result: RunResult): boolean {
  return result.error === null && result.tests.length > 0 && result.tests.every((test) => test.passed)
}

/** The run as plain text, for code_snippets.last_output. */
export function resultText(result: RunResult): string {
  const parts = [result.output, result.error ?? ''].filter(Boolean)
  if (result.tests.length > 0) parts.push(`${result.tests.filter((test) => test.passed).length} of ${result.tests.length} tests passed`)
  return parts.join('\n').slice(0, 4000)
}
