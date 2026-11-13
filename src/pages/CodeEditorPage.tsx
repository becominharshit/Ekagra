import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Circle, Keyboard, LoaderCircle, Play, RotateCcw, Save, Square, X } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { Markdown } from '@/components/Markdown'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAcademicsMutation } from '@/features/academics/subjects'
import { CodeEditor } from '@/features/coding/CodeEditor'
import { CODING_LANGUAGES, LANGUAGE_SPECS, normalizeCodingLanguage, type CodingLanguage } from '@/features/coding/languages'
import { problemBody, readCodeAnswer, readCodeTests } from '@/features/coding/problems'
import { allPassed, resultText, type RunResult } from '@/features/coding/python'
import { RUN_LIMIT_SECONDS, useCodeRunner, type RunnerStatus } from '@/features/coding/runner'
import { updateSnippet, useCodeProblems, useSnippets, type CodeProblem, type Snippet } from '@/features/coding/snippets'
import type { CodeTest } from '@shared/schemas.ts'

/** One file in the Coding Lab: a problem with its tests, or a free file in Python, JS, TS, or SQL. */
export function CodeEditorPage() {
  const { snippetId } = useParams()
  const snippets = useSnippets()
  const problems = useCodeProblems()

  if (snippets.isPending || problems.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading…
      </p>
    )
  }
  const snippet = snippets.data?.find((file) => file.id === snippetId)
  if (!snippet) {
    return (
      <div className="grid gap-3">
        <p role="alert" className="text-sm text-destructive">
          {snippets.error?.message ?? 'This file was not found.'}
        </p>
        <BackLink />
      </div>
    )
  }
  const problem = snippet.question_id ? (problems.data?.find((question) => question.id === snippet.question_id) ?? null) : null
  return <Workspace key={snippet.id} snippet={snippet} problem={problem} />
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 justify-self-start">
      <Link to="/academics/code">
        <ArrowLeft aria-hidden />
        Coding Lab
      </Link>
    </Button>
  )
}

function Workspace({ snippet, problem }: { snippet: Snippet; problem: CodeProblem | null }) {
  const [language, setLanguage] = useState<CodingLanguage>(() => normalizeCodingLanguage(snippet.language))
  const spec = LANGUAGE_SPECS[language]
  const runner = useCodeRunner(language)
  const save = useAcademicsMutation(updateSnippet)
  const [code, setCode] = useState(snippet.code)
  const [title, setTitle] = useState(snippet.title)
  const [input, setInput] = useState('')
  const [showInput, setShowInput] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [showSolution, setShowSolution] = useState(false)

  const tests = problem ? readCodeTests(problem.tests) : []
  const answer = problem ? readCodeAnswer(problem.answer) : null
  const savedTitle = problem ? snippet.title : title.trim() || 'Untitled'
  const dirty = code !== snippet.code || savedTitle !== snippet.title || language !== normalizeCodingLanguage(snippet.language)

  function handleLanguageChange(nextRaw: string) {
    if (runner.status !== 'idle') return
    const nextLang = normalizeCodingLanguage(nextRaw)
    if (nextLang === language) return
    if (code.trim() === '' || code === LANGUAGE_SPECS[language].defaultCode) {
      setCode(LANGUAGE_SPECS[nextLang].defaultCode)
    }
    if (!LANGUAGE_SPECS[nextLang].supportsStdin) {
      setShowInput(false)
    }
    setLanguage(nextLang)
    setResult(null)
    setStartError(null)
  }

  // Leaving the page saves what isn't saved yet, so code is never lost.
  const unsaved = useRef({ dirty, save: () => {} })
  useEffect(() => {
    unsaved.current = {
      dirty,
      save: () => save.mutate({ id: snippet.id, patch: { code, title: savedTitle, language } }),
    }
  })
  useEffect(
    () => () => {
      if (unsaved.current.dirty) unsaved.current.save()
    },
    [],
  )

  async function run() {
    if (runner.status !== 'idle') return
    setStartError(null)
    try {
      const outcome = await runner.run({ code, tests, input })
      setResult(outcome)
      // Running also saves the code, what it printed and (for problems) whether every test passed.
      save.mutate({
        id: snippet.id,
        patch: {
          code,
          title: savedTitle,
          language,
          last_output: resultText(outcome),
          last_run_at: new Date().toISOString(),
          passed: tests.length > 0 ? allPassed(outcome) : null,
        },
      })
    } catch (error) {
      setStartError(error instanceof Error ? error.message : `${spec.label} could not start.`)
    }
  }

  return (
    <>
      <BackLink />
      {problem ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-xl font-semibold tracking-tight">{snippet.title}</h1>
          <Badge variant="outline">{spec.label}</Badge>
        </div>
      ) : (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input
            aria-label="File name"
            className="h-10 min-w-48 flex-1 font-heading text-lg font-semibold"
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Select value={language} onValueChange={handleLanguageChange} disabled={runner.status !== 'idle'}>
            <SelectTrigger aria-label="Language" className="h-10 min-w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CODING_LANGUAGES.map((lang) => (
                <SelectItem key={lang} value={lang}>
                  {LANGUAGE_SPECS[lang].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-4">
        {problem && (
          <Card size="sm">
            <CardContent className="grid gap-3">
              <Markdown>{problemBody(problem.prompt)}</Markdown>
              <TestList tests={tests} result={result} />
            </CardContent>
          </Card>
        )}

        <CodeEditor value={code} onChange={setCode} onRun={() => void run()} label={spec.editorLabel} language={language} />

        <div className="flex flex-wrap items-center gap-2">
          {runner.status === 'idle' ? (
            <Button onClick={() => void run()}>
              <Play aria-hidden />
              Run
            </Button>
          ) : (
            <Button variant="outline" onClick={runner.stop}>
              <Square aria-hidden />
              Stop
            </Button>
          )}
          <Button
            variant="outline"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate({ id: snippet.id, patch: { code, title: savedTitle, language } })}
          >
            <Save aria-hidden />
            Save
          </Button>
          {spec.supportsStdin && (
            <Button variant="ghost" aria-expanded={showInput} onClick={() => setShowInput(!showInput)}>
              <Keyboard aria-hidden />
              Program input
            </Button>
          )}
          {answer && (
            <Button variant="ghost" onClick={() => setResetting(true)}>
              <RotateCcw aria-hidden />
              Start again
            </Button>
          )}
          {dirty && <span className="text-xs text-muted-foreground">Not saved yet</span>}
        </div>
        <p className="hidden text-xs text-muted-foreground sm:block">Ctrl+Enter runs the code. Running also saves it.</p>

        {spec.supportsStdin && showInput && (
          <div className="grid gap-2">
            <Label htmlFor="program-input">Program input (one line for each input() call)</Label>
            <Textarea id="program-input" rows={3} className="font-mono text-sm" value={input} onChange={(event) => setInput(event.target.value)} />
          </div>
        )}

        <Status status={runner.status} result={result} language={language} />
        {(startError || save.error) && (
          <p role="alert" className="text-sm text-destructive">
            {startError ?? save.error?.message}
          </p>
        )}
        {result && <Output result={result} supportsStdin={spec.supportsStdin} />}

        {answer && (result !== null || snippet.last_run_at !== null) && (
          <Card size="sm">
            <CardHeader>
              <CardTitle>Model solution</CardTitle>
            </CardHeader>
            <CardContent>
              {showSolution ? (
                <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">{answer.solution}</pre>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setShowSolution(true)}>
                  Show it (try a few times first)
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={resetting} onOpenChange={setResetting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start again?</AlertDialogTitle>
            <AlertDialogDescription>Your code is replaced with the starter code. Undo in the editor (Ctrl+Z) brings it back.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my code</AlertDialogCancel>
            <AlertDialogAction onClick={() => answer && setCode(answer.starter)}>Start again</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** The problem's tests, with ✓ or ✗ after a run. */
function TestList({ tests, result }: { tests: CodeTest[]; result: RunResult | null }) {
  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-medium">Tests</p>
      <ul className="grid gap-1 font-mono text-xs">
        {tests.map((test, index) => {
          const outcome = result?.tests[index]
          return (
            <li key={`${index}-${test.call}`} className="flex items-start gap-2">
              {!outcome ? (
                <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-label="Not run" />
              ) : outcome.passed ? (
                <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-label="Passed" />
              ) : (
                <X className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-label="Failed" />
              )}
              <span className="min-w-0 break-words">
                {test.call} → {test.expected}
                {outcome && !outcome.passed && <span className="text-destructive"> · got {outcome.error ?? outcome.actual}</span>}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Status({ status, result, language }: { status: RunnerStatus; result: RunResult | null; language: CodingLanguage }) {
  if (status === 'idle') {
    return result && !result.error ? <p className="text-xs text-muted-foreground">Ran in {result.durationMs} ms.</p> : null
  }
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      {status === 'loading'
        ? language === 'python'
          ? 'Getting Python ready… The first time it downloads about 13 MB.'
          : `Starting ${LANGUAGE_SPECS[language].label} runtime…`
        : `Running… (stops by itself after ${RUN_LIMIT_SECONDS} seconds)`}
    </p>
  )
}

function Output({ result, supportsStdin }: { result: RunResult; supportsStdin: boolean }) {
  const passedCount = result.tests.filter((test) => test.passed).length
  return (
    <div className="grid gap-2">
      {result.tests.length > 0 && (
        <p className={allPassed(result) ? 'font-medium text-emerald-600' : 'font-medium'}>
          {allPassed(result) ? `All ${result.tests.length} tests passed. Well done!` : `${passedCount} of ${result.tests.length} tests passed.`}
        </p>
      )}
      <pre aria-label="Output" className="max-h-80 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs break-words whitespace-pre-wrap">
        {result.output || (result.error ? '' : '(nothing was printed)')}
        {result.output && result.error ? '\n' : ''}
        {result.error && <span className="text-destructive">{result.error}</span>}
      </pre>
      {supportsStdin && result.error?.includes('EOFError') && (
        <p className="text-xs text-muted-foreground">Your program asked for more input than it got. Add lines under Program input, one for each input().</p>
      )}
    </div>
  )
}
