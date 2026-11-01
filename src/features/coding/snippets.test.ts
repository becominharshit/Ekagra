import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { problemBody, problemTitle, readCodeAnswer, readCodeTests, STARTER_PROBLEMS } from './problems'
import { addStarterProblems, listCodeProblems, listSnippets, newScratchFile, openProblem, updateSnippet } from './snippets'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }

describe('reading a code problem', () => {
  it('takes the title from the first line of the prompt and the description from the rest', () => {
    expect(problemTitle('## **Factorial**\n\nWrite `factorial(n)`.')).toBe('Factorial')
    expect(problemBody('Factorial\n\nWrite `factorial(n)`.')).toBe('Write `factorial(n)`.')
    expect(problemTitle('')).toBe('Code problem')
  })

  it('reads the saved tests and answer, and treats broken ones as missing', () => {
    expect(readCodeTests([{ call: 'f(1)', expected: '2' }])).toEqual([{ call: 'f(1)', expected: '2' }])
    expect(readCodeTests([{ call: 'f(1)' }])).toEqual([])
    expect(readCodeTests(null)).toEqual([])
    expect(readCodeAnswer({ starter: 'def f(n):\n    pass', solution: 'def f(n):\n    return n' })).toMatchObject({ starter: 'def f(n):\n    pass' })
    expect(readCodeAnswer({ starter: 'x' })).toBeNull()
  })
})

describe('Coding Lab data (Demo Mode)', () => {
  it('adds the starter problems once, in their order, and skips code questions without tests', async () => {
    demoDb.insert('questions', [{ source: 'pyq', type: 'code', prompt: 'Write a program to print primes.' }])
    expect(await addStarterProblems(DEMO)).toBe(STARTER_PROBLEMS.length)
    expect(await addStarterProblems(DEMO)).toBe(0)

    const problems = await listCodeProblems(DEMO)
    expect(problems.map((problem) => problemTitle(problem.prompt))).toEqual(STARTER_PROBLEMS.map((problem) => problemTitle(problem.prompt)))
    expect(problems[0]).toMatchObject({ source: 'manual', type: 'code', source_ref: { set: 'starter', key: 'total', order: 0 } })
  })

  it("opens a problem in a file with the starter code, and reopens the student's file later", async () => {
    await addStarterProblems(DEMO)
    const [factorial] = (await listCodeProblems(DEMO)).filter((problem) => problemTitle(problem.prompt) === 'Factorial')
    if (!factorial) throw new Error('no factorial problem')

    const file = await openProblem(DEMO, factorial)
    expect(file).toMatchObject({ title: 'Factorial', question_id: factorial.id, passed: null })
    expect(file.code).toContain('def factorial(n):')

    await updateSnippet(DEMO, { id: file.id, patch: { code: 'def factorial(n):\n    return 1', passed: false } })
    const again = await openProblem(DEMO, factorial)
    expect(again).toMatchObject({ id: file.id, code: 'def factorial(n):\n    return 1', passed: false })
    expect(await listSnippets(DEMO)).toHaveLength(1)
  })

  it('makes free files to try things out', async () => {
    const file = await newScratchFile(DEMO)
    expect(file).toMatchObject({ title: 'Untitled', language: 'python', question_id: null })
    expect(file.code).toContain('print(')
  })
})
