import type { RunRequest, RunResult, TestResult } from './python'
import { stripTypeScript } from './tsStrip'

const MAX_OUTPUT = 20_000

function formatValue(val: unknown): string {
  if (typeof val === 'string') return val
  if (val === undefined) return 'undefined'
  if (val === null) return 'null'
  if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'bigint') return String(val)
  if (typeof val === 'symbol' || typeof val === 'function') return val.toString()
  try {
    return JSON.stringify(val)
  } catch {
    return String(val)
  }
}

function formatRepr(val: unknown): string {
  if (typeof val === 'string') return JSON.stringify(val)
  const text = formatValue(val)
  return text.length <= 300 ? text : `${text.slice(0, 300)}…`
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== typeof b || a === null || b === null) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, idx) => deepEqual(item, b[idx]))
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>
    const bObj = b as Record<string, unknown>
    const keys = Object.keys(aObj)
    if (keys.length !== Object.keys(bObj).length) return false
    return keys.every((key) => Object.prototype.hasOwnProperty.call(bObj, key) && deepEqual(aObj[key], bObj[key]))
  }
  return false
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>

export interface JsRunRequest extends RunRequest {
  language: 'javascript' | 'typescript'
}

/** Runs JavaScript or TypeScript code inside a restricted AsyncFunction scope (used by js.worker.ts and tests). */
export async function runJavaScriptOrTypeScript(request: JsRunRequest): Promise<RunResult> {
  const started = performance.now()
  let output = ''
  const append = (line: string) => {
    if (output.length >= MAX_OUTPUT) return
    output += (output ? '\n' : '') + line
  }

  const lines = request.input === '' ? [] : request.input.split(/\r?\n/)
  const sandboxConsole = {
    log: (...args: unknown[]) => append(args.map(formatValue).join(' ')),
    info: (...args: unknown[]) => append(args.map(formatValue).join(' ')),
    warn: (...args: unknown[]) => append(args.map(formatValue).join(' ')),
    error: (...args: unknown[]) => append(args.map(formatValue).join(' ')),
  }
  const inputHelper = (prompt?: string) => {
    if (prompt) append(prompt)
    const next = lines.shift()
    if (next === undefined) throw new Error('EOFError: no more input lines')
    return next
  }

  const jsCode = request.language === 'typescript' ? stripTypeScript(request.code) : request.code

  // Note: tests run inside the same lexical scope by appending an evaluator hook when tests exist.
  const harnessSuffix =
    request.tests.length > 0
      ? `\n;return async (__callExpr) => eval(__callExpr);`
      : '\n;return null;'

  // Shadow browser/worker network and persistence APIs inside the student code block.
  const wrappedSource = `
    "use strict";
    const fetch = undefined;
    const XMLHttpRequest = undefined;
    const WebSocket = undefined;
    const importScripts = undefined;
    const indexedDB = undefined;
    const caches = undefined;
    const localStorage = undefined;
    const sessionStorage = undefined;
    const navigator = undefined;
    const self = undefined;
    const window = undefined;
    const globalThis = undefined;
    ${jsCode}
    ${harnessSuffix}
  `

  let error: string | null = null
  let tests: TestResult[] = []

  try {
    const fn = new AsyncFunction('console', 'input', wrappedSource)
    const evaluator = (await fn(sandboxConsole, inputHelper)) as ((expr: string) => Promise<unknown>) | null

    if (evaluator && request.tests.length > 0) {
      tests = []
      for (const testCase of request.tests) {
        try {
          const actual = await evaluator(testCase.call)
          const expected = await new AsyncFunction(`"use strict"; return (${testCase.expected})`)()
          tests.push({
            ...testCase,
            passed: deepEqual(actual, expected),
            actual: formatRepr(actual),
            error: null,
          })
        } catch (err) {
          tests.push({
            ...testCase,
            passed: false,
            actual: null,
            error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
          })
        }
      }
    }
  } catch (err) {
    error = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  }

  if (output.length > MAX_OUTPUT) {
    output = `${output.slice(0, MAX_OUTPUT)}\n… (the rest of the output is cut)`
  }

  return {
    output,
    error,
    tests,
    durationMs: Math.round(performance.now() - started),
  }
}

export type JsWorkerMessage =
  | { type: 'ready' }
  | { type: 'result'; id: number; result: RunResult }
