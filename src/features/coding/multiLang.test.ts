import { describe, expect, it } from 'vitest'
import { runJavaScriptOrTypeScript } from './jsRuntime'
import { normalizeCodingLanguage } from './languages'
import { runSql } from './sql'
import { stripTypeScript } from './tsStrip'

describe('normalizeCodingLanguage', () => {
  it('normalizes valid languages, short aliases (js/ts/py), and falls back to python', () => {
    expect(normalizeCodingLanguage('javascript')).toBe('javascript')
    expect(normalizeCodingLanguage('js')).toBe('javascript')
    expect(normalizeCodingLanguage(' JS ')).toBe('javascript')
    expect(normalizeCodingLanguage('typescript')).toBe('typescript')
    expect(normalizeCodingLanguage('ts')).toBe('typescript')
    expect(normalizeCodingLanguage('py')).toBe('python')
    expect(normalizeCodingLanguage('sql')).toBe('sql')
    expect(normalizeCodingLanguage('python')).toBe('python')
    expect(normalizeCodingLanguage(null)).toBe('python')
    expect(normalizeCodingLanguage('rust')).toBe('python')
  })
})

describe('stripTypeScript', () => {
  it('strips interfaces, type aliases, enums, and type annotations while preserving code lines', () => {
    const tsSource = `
interface Student {
  id: number;
  name: string;
}

type Score = number | null;

enum Status {
  Ready = 'ready',
  Done = 2,
}

export function greet(student: Student, score: Score = 10): string {
  const msg: string = \`\${student.name}: \${score} (\${Status.Ready})\`;
  return msg as string;
}
`.trim()

    const stripped = stripTypeScript(tsSource)
    expect(stripped).not.toContain('interface Student')
    expect(stripped).not.toContain('type Score')
    expect(stripped).toContain('function greet(student')
    expect(stripped).toContain('Status =')
    expect(stripped.split('\n').length).toBe(tsSource.split('\n').length)
  })
})

describe('runJavaScriptOrTypeScript', () => {
  it('captures console output, top-level await, and stdin input()', async () => {
    const outcome = await runJavaScriptOrTypeScript({
      language: 'javascript',
      code: `
        const name = input();
        const total = await Promise.resolve(21 * 2);
        console.log('hi', name, total);
      `,
      input: 'Asha',
      tests: [],
    })

    expect(outcome.error).toBeNull()
    expect(outcome.output).toBe('hi Asha 42')
  })

  it('blocks access to network and browser globals inside student code', async () => {
    const outcome = await runJavaScriptOrTypeScript({
      language: 'javascript',
      code: `
        console.log(typeof fetch, typeof XMLHttpRequest, typeof WebSocket, typeof indexedDB, typeof window, typeof globalThis);
      `,
      input: '',
      tests: [],
    })

    expect(outcome.error).toBeNull()
    expect(outcome.output).toBe('undefined undefined undefined undefined undefined undefined')
  })

  it('runs TypeScript code and evaluates test cases in lexical scope', async () => {
    const outcome = await runJavaScriptOrTypeScript({
      language: 'typescript',
      code: `
        interface Pair {
          a: number;
          b: number;
        }
        function addPair(pair: Pair): number {
          return pair.a + pair.b;
        }
        const sum: number = addPair({ a: 20, b: 22 });
        console.log(sum);
      `,
      input: '',
      tests: [
        { call: 'addPair({ a: 3, b: 4 })', expected: '7' },
        { call: 'addPair({ a: 10, b: 2 })', expected: '99' },
      ],
    })

    expect(outcome.error).toBeNull()
    expect(outcome.output).toBe('42')
    expect(outcome.tests).toHaveLength(2)
    expect(outcome.tests[0]?.passed).toBe(true)
    expect(outcome.tests[1]?.passed).toBe(false)
    expect(outcome.tests[1]?.actual).toBe('12')
  })
})

describe('runSql (PGlite)', () => {
  it('creates tables, inserts rows, and formats SELECT tables', async () => {
    const outcome = await runSql({
      code: `
        CREATE TABLE topics (id INT PRIMARY KEY, name TEXT NOT NULL, hours INT NOT NULL);
        INSERT INTO topics VALUES (1, 'Graphs', 4), (2, 'SQL', 2);
        SELECT name, hours FROM topics ORDER BY hours DESC;
      `,
      input: '',
      tests: [{ call: 'SELECT COUNT(*)::int FROM topics', expected: '2' }],
    })

    expect(outcome.error).toBeNull()
    expect(outcome.output).toContain('name')
    expect(outcome.output).toContain('Graphs')
    expect(outcome.output).toContain('SQL')
    expect(outcome.tests[0]?.passed).toBe(true)
  })

  it('reports clean SQL error diagnostics without crashing', async () => {
    const outcome = await runSql({
      code: 'SELECT * FROM table_that_does_not_exist;',
      input: '',
      tests: [],
    })

    expect(outcome.error).toContain('does not exist')
  })
})
