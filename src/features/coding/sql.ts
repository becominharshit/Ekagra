import type { RunRequest, RunResult, TestResult } from './python'

const MAX_OUTPUT = 20_000

interface SqlField {
  name: string
}

interface SqlResultSet {
  rows: Array<Record<string, unknown>>
  fields: SqlField[]
  affectedRows?: number
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function formatResultTable(resultSet: SqlResultSet): string {
  const columns = resultSet.fields.map((field) => field.name)
  if (columns.length === 0) return ''

  const rows = resultSet.rows.map((row) => columns.map((col) => formatCell(row[col])))
  const widths = columns.map((col, idx) => {
    const cellWidths = rows.map((row) => row[idx]?.length ?? 0)
    return Math.max(col.length, ...cellWidths)
  })

  const header = columns.map((col, idx) => col.padEnd(widths[idx] ?? col.length)).join(' | ')
  const divider = widths.map((w) => '-'.repeat(w)).join('-+-')
  if (rows.length === 0) {
    return `${header}\n${divider}\n(0 rows)`
  }
  const body = rows
    .map((row) => row.map((cell, idx) => cell.padEnd(widths[idx] ?? cell.length)).join(' | '))
    .join('\n')
  return `${header}\n${divider}\n${body}`
}

function extractSqlError(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err)
  const record = err as Record<string, unknown>
  const message = typeof record.message === 'string' ? record.message : String(err)
  const parts = [message]
  if (typeof record.detail === 'string' && record.detail) parts.push(`Detail: ${record.detail}`)
  if (typeof record.hint === 'string' && record.hint) parts.push(`Hint: ${record.hint}`)
  return parts.join('\n')
}

function extractComparableValue(resultSet: SqlResultSet | undefined): unknown {
  if (!resultSet || resultSet.rows.length === 0) return null
  if (resultSet.rows.length === 1 && resultSet.fields.length === 1) {
    const col = resultSet.fields[0]?.name
    return col ? resultSet.rows[0]?.[col] ?? null : null
  }
  return resultSet.rows
}

/** Runs SQL statements inside an isolated ephemeral PGlite (PostgreSQL WASM) instance. */
export async function runSql(request: RunRequest): Promise<RunResult> {
  const started = performance.now()
  if (!request.code.trim()) {
    return { output: '', error: null, tests: [], durationMs: 0 }
  }

  const { PGlite } = await import('@electric-sql/pglite')
  const db = new PGlite()
  let output = ''
  let error: string | null = null
  const tests: TestResult[] = []

  try {
    const resultSets = (await db.exec(request.code)) as unknown as SqlResultSet[]
    const tables = resultSets.filter((r) => r.fields.length > 0).map(formatResultTable)

    if (tables.length > 0) {
      output = tables.join('\n\n')
    } else if (resultSets.length > 0) {
      const affected = resultSets.reduce((sum, r) => sum + (r.affectedRows ?? 0), 0)
      output = affected > 0 ? `OK (${affected} row${affected === 1 ? '' : 's'} affected)` : 'OK'
    }

    for (const testCase of request.tests) {
      try {
        const res = (await db.exec(testCase.call)) as unknown as SqlResultSet[]
        const actual = extractComparableValue(res[res.length - 1])
        const actualText = typeof actual === 'string' ? actual : JSON.stringify(actual)
        const expectedTrimmed = testCase.expected.trim()
        const normalizedExpected =
          (expectedTrimmed.startsWith("'") && expectedTrimmed.endsWith("'")) ||
          (expectedTrimmed.startsWith('"') && expectedTrimmed.endsWith('"'))
            ? expectedTrimmed.slice(1, -1)
            : expectedTrimmed
        const passed = String(actual) === normalizedExpected || actualText === expectedTrimmed
        tests.push({
          ...testCase,
          passed,
          actual: actualText,
          error: null,
        })
      } catch (testErr) {
        tests.push({
          ...testCase,
          passed: false,
          actual: null,
          error: extractSqlError(testErr),
        })
      }
    }
  } catch (err) {
    error = extractSqlError(err)
  } finally {
    await db.close().catch(() => {})
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

export type SqlWorkerMessage =
  | { type: 'ready' }
  | { type: 'result'; id: number; result: RunResult }
