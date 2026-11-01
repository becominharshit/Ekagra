import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { ArrowLeft, LoaderCircle, ScrollText, Timer } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { countLabel, minutesLabel } from '@/features/academics/labels'
import { useSubject } from '@/features/academics/subjects'
import { MockResults } from '@/features/mock/MockResults'
import { MockRunner } from '@/features/mock/MockRunner'
import { finishedMock, markMock, newProgress, useMockProgress, useMockSetup, useSaveMock, type MockProgress } from '@/features/mock/mockTest'
import { buildMockTest, groupLabel, scalePattern, SECTION_LABEL } from '@/features/mock/pattern'
import { useDataSource } from '@/lib/dataSource'
import { cn } from '@/lib/utils'

/** Academics → a subject → Mock test: a timed paper in the exam's pattern, marked, with results per topic. */
export function MockTestPage() {
  const { subjectId = '' } = useParams()
  const { owner } = useDataSource()
  if (!owner) return null
  // A new person or subject starts fresh (the test in progress is kept per person and subject).
  return <MockTestScreen key={`${owner}:${subjectId}`} owner={owner} subjectId={subjectId} />
}

function MockTestScreen({ owner, subjectId }: { owner: string; subjectId: string }) {
  const subject = useSubject(subjectId)
  const setup = useMockSetup(subjectId)
  const { source } = useDataSource()
  const [progress, setProgress] = useMockProgress(owner, subjectId)
  const [saved, setSaved] = useState<MockProgress | null>(null)
  const [half, setHalf] = useState(false)
  const save = useSaveMock()
  const marking = useRef<string | null>(null)
  const name = subject.data?.name ?? 'Subject'

  // Marks a handed-in test, also one handed in before the app was closed.
  const toMark = progress?.finishedAt && !progress.marks ? progress : null
  const subjectName = subject.data?.name
  useEffect(() => {
    if (!toMark || !source || !subjectName || marking.current === toMark.quizId) return
    marking.current = toMark.quizId
    const { quizId, questions, answers } = toMark
    void markMock(source, { subject: subjectName, questions, answers }).then(({ marks, aiError }) => {
      setProgress((latest) => (latest?.quizId === quizId ? { ...latest, marks, aiError } : latest))
    })
  }, [toMark, source, subjectName, setProgress])

  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
      <Link to={`/academics/subjects/${subjectId}`}>
        <ArrowLeft aria-hidden />
        {name}
      </Link>
    </Button>
  )

  const addTime = (latest: MockProgress, spentMs: number) => {
    const id = latest.questions[latest.current]?.id
    return id ? { ...latest.timeMs, [id]: (latest.timeMs[id] ?? 0) + spentMs } : latest.timeMs
  }

  if (progress && !progress.finishedAt) {
    return (
      <MockRunner
        progress={progress}
        onAnswer={(questionId, given) =>
          setProgress((latest) => (latest && !latest.finishedAt ? { ...latest, answers: { ...latest.answers, [questionId]: given } } : latest))
        }
        onGo={(index, spentMs) =>
          setProgress((latest) =>
            latest && !latest.finishedAt ? { ...latest, timeMs: addTime(latest, spentMs), current: Math.max(0, Math.min(index, latest.questions.length - 1)) } : latest,
          )
        }
        onHandIn={(spentMs) => {
          const now = Date.now()
          setProgress((latest) => {
            if (!latest || latest.finishedAt) return latest
            // Back after the end: the test ended when the time ran out.
            const deadline = Date.parse(latest.startedAt) + latest.minutes * 60_000
            return { ...latest, timeMs: addTime(latest, spentMs), finishedAt: new Date(Math.min(now, deadline)).toISOString() }
          })
        }}
        onDiscard={() => setProgress(null)}
      />
    )
  }

  if (progress && !progress.marks) {
    return (
      <>
        {back}
        <PageHeader title={`Mock test: ${name}`} />
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          {source?.kind === 'supabase' ? 'The AI is marking your written answers like an examiner…' : 'Marking your answers…'}
        </p>
      </>
    )
  }

  const results = progress ?? saved
  if (results?.marks) {
    return (
      <>
        {back}
        <PageHeader title={`Mock test: ${name}`} />
        <MockResults
          progress={results}
          topicTitles={setup.data?.topicTitles ?? new Map()}
          saved={!progress}
          saving={save.isPending}
          error={save.error?.message ?? null}
          onMark={(questionId, awarded) =>
            setProgress((latest) => {
              const mark = latest?.marks?.[questionId]
              return latest?.marks && mark ? { ...latest, marks: { ...latest.marks, [questionId]: { ...mark, awarded, by: 'self' } } } : latest
            })
          }
          onSave={() => {
            const mock = progress ? finishedMock(progress) : null
            if (!mock) return
            save.mutate(mock, {
              onSuccess: () => {
                setSaved(progress)
                setProgress(null)
              },
            })
          }}
          onDiscard={() => setProgress(null)}
          onNew={() => {
            save.reset()
            setSaved(null)
          }}
        />
      </>
    )
  }

  if (setup.isPending || subject.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading…
      </p>
    )
  }
  if (setup.isError || subject.isError || !subject.data || !setup.data) {
    return (
      <>
        {back}
        <p role="alert" className="text-sm text-destructive">
          {setup.error?.message ?? subject.error?.message ?? 'This subject was not found.'}
        </p>
      </>
    )
  }

  const { pattern, pool, choice, mocks } = setup.data
  const halfPattern = pattern ? scalePattern(pattern, 0.5) : null
  const canHalve = pattern !== null && halfPattern !== null && halfPattern.totalMarks < pattern.totalMarks
  const chosen = half && canHalve ? halfPattern : pattern
  const test = chosen ? buildMockTest(chosen, pool, choice) : null

  function start() {
    if (!test || test.questions.length === 0) return
    save.reset()
    setSaved(null)
    setProgress(newProgress(subjectId, test))
  }

  return (
    <>
      {back}
      <PageHeader title={`Mock test: ${name}`} subtitle="A timed paper in your exam's pattern, made from your past papers." />
      <div className="grid gap-4">
        {!pattern || !chosen || !test ? (
          <Card>
            <CardHeader>
              <CardTitle>Add a past paper first</CardTitle>
              <CardDescription>The mock test copies your exam's pattern from past papers: how many questions of each type and marks, and the time.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link to={`/academics/subjects/${subjectId}/papers`}>
                  <ScrollText aria-hidden />
                  Past papers
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Your exam's pattern</CardTitle>
              <CardDescription>
                From {countLabel(pattern.papers, 'past paper')}: {pattern.totalMarks} marks in {minutesLabel(pattern.minutes)} (1.8 minutes per mark).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {canHalve && halfPattern && (
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Length">
                  {[
                    { value: false, label: 'Full paper', of: pattern },
                    { value: true, label: 'Half paper', of: halfPattern },
                  ].map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      role="radio"
                      aria-checked={half === option.value}
                      className={cn('grid gap-0.5 rounded-lg border p-3 text-left text-sm transition-colors', half === option.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/40')}
                      onClick={() => setHalf(option.value)}
                    >
                      <span className="font-medium">{option.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {option.of.totalMarks} marks · {minutesLabel(option.of.minutes)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <ul className="grid gap-1 text-sm">
                {chosen.groups.map((group) => (
                  <li key={`${group.type}-${group.marks}`} className="flex justify-between gap-2">
                    <span>{SECTION_LABEL[group.type]}</span>
                    <span className="tabular-nums text-muted-foreground">{groupLabel(group)}</span>
                  </li>
                ))}
              </ul>
              {test.missing > 0 && (
                <p className="text-sm text-muted-foreground">
                  {countLabel(test.missing, 'question')} of the pattern couldn't be filled from your past papers, so this test is a little shorter.
                </p>
              )}
              <ul className="grid list-disc gap-1 pl-5 text-sm text-muted-foreground">
                <li>When the time is up, the test is handed in by itself.</li>
                <li>The clock keeps running if you leave the screen; your answers stay on this device.</li>
                <li>
                  {source?.kind === 'supabase'
                    ? 'Written answers are marked by the AI like an examiner. Points are fine for long answers.'
                    : 'In Demo Mode your device gives written answers a rough mark (or leaves them for you): check each one.'}
                </li>
                <li>Answers under half marks go to your mistake notebook.</li>
              </ul>
              <Button className="justify-self-start" disabled={test.questions.length === 0} onClick={start}>
                <Timer aria-hidden />
                Start ({minutesLabel(test.minutes)})
              </Button>
            </CardContent>
          </Card>
        )}

        {mocks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Earlier mock tests</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-1 text-sm">
                {mocks.slice(0, 8).map((quiz) => (
                  <li key={quiz.id} className="flex justify-between gap-2">
                    <span>{format(new Date(quiz.started_at), 'EEE d MMM, HH:mm')}</span>
                    <span className="font-medium tabular-nums">{Math.round(Number(quiz.score ?? 0) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
