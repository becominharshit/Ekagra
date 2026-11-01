import { loadPyodide, version, type PyodideAPI } from 'pyodide'
import { beforeAll, describe, expect, it } from 'vitest'
import { STARTER_PROBLEMS } from './problems'
import { allPassed, cleanTraceback, PYODIDE_VERSION, resultText, runWithPyodide } from './python'

// These tests run real Python: the same Pyodide the app downloads, from the npm package.
let pyodide: PyodideAPI

beforeAll(async () => {
  pyodide = await loadPyodide()
}, 120_000)

const run = (code: string, input = '', tests: { call: string; expected: string }[] = []) => runWithPyodide(pyodide, { code, input, tests })

it('uses the Pyodide version the app downloads from the CDN', () => {
  expect(version).toBe(PYODIDE_VERSION)
})

describe('running code', () => {
  it('captures what the program prints', async () => {
    const result = await run('for i in range(3):\n    print("line", i)\nprint("done", end="")')
    expect(result).toMatchObject({ output: 'line 0\nline 1\nline 2\ndone', error: null, tests: [] })
  })

  it('gives input() the lines the student typed, shown after the prompt like a terminal', async () => {
    const result = await run('name = input("Name: ")\nage = int(input())\nprint(name, age + 1)', 'Asha\n20')
    expect(result.error).toBeNull()
    expect(result.output).toBe('Name: Asha\n20\nAsha 21')
  })

  it('stops with EOFError when the program wants more input than given', async () => {
    const result = await run('a = input()\nb = input()', 'only one line')
    expect(result.error).toContain('EOFError')
  })

  it("shows a short traceback with the student's own line numbers", async () => {
    const result = await run('def half(n):\n    return n / 0\n\nprint(half(4))')
    expect(result.error).toBe(
      ['Traceback (most recent call last):', '  Line 4, in <module>', '  Line 2, in half', 'ZeroDivisionError: division by zero'].join('\n'),
    )
  })

  it('explains syntax errors at the right line', async () => {
    const result = await run('x = 1\nprint("hi"')
    expect(result.error).toContain('Line 2')
    expect(result.error).toContain('SyntaxError')
  })

  it('keeps each run separate', async () => {
    await run('secret = 42')
    expect((await run('print(secret)')).error).toContain("NameError: name 'secret' is not defined")
  })
})

describe('tests', () => {
  const tests = [
    { call: 'double(2)', expected: '4' },
    { call: 'double("ab")', expected: "'abab'" },
    { call: 'double(None)', expected: '0' },
  ]

  it('runs each test in the same namespace and says what the code gave', async () => {
    const result = await run('def double(x):\n    return x * 2', '', tests)
    expect(result.tests.map((test) => [test.passed, test.actual, test.error?.split(':')[0] ?? null])).toEqual([
      [true, '4', null],
      [true, "'abab'", null],
      [false, null, 'TypeError'],
    ])
    expect(allPassed(result)).toBe(false)
    expect(resultText(result)).toBe('2 of 3 tests passed')
  })

  it("doesn't run the tests when the program itself crashes", async () => {
    const result = await run('def double(x):\n    return x * 2\nprint(1 / 0)', '', tests)
    expect(result.error).toContain('ZeroDivisionError')
    expect(result.tests).toEqual([])
  })
})

describe('starter problems', () => {
  it.each(STARTER_PROBLEMS)('$key: the model solution passes every test, the starter code does not', async (problem) => {
    const solved = await run(problem.answer.solution, '', problem.tests)
    expect(solved.tests.filter((test) => !test.passed)).toEqual([])
    expect(allPassed(solved)).toBe(true)

    const started = await run(problem.answer.starter, '', problem.tests)
    expect(started.error).toBeNull() // the starter code runs; it just doesn't solve the problem yet
    expect(allPassed(started)).toBe(false)
  })
})

describe('cleanTraceback', () => {
  it("drops Pyodide's own frames", () => {
    const message = [
      'Traceback (most recent call last):',
      '  File "/lib/python314.zip/_pyodide/_base.py", line 597, in eval_code_async',
      '    await CodeRunner(',
      '  File "<exec>", line 1, in <module>',
      "NameError: name 'x' is not defined",
    ].join('\n')
    expect(cleanTraceback(message)).toBe(['Traceback (most recent call last):', '  Line 1, in <module>', "NameError: name 'x' is not defined"].join('\n'))
  })

  it('keeps just the last line when the student\'s code is not involved', () => {
    expect(cleanTraceback('Traceback (most recent call last):\n  File "/lib/x.py", line 3\nOSError: boom')).toBe('OSError: boom')
  })
})
