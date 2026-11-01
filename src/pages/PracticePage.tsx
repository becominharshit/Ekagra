import { useState } from 'react'
import { ArrowLeft, Check, LoaderCircle, Target, X } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSubject } from '@/features/academics/subjects'
import { pickNext, ratingLabel } from '@/features/practice/elo'
import { finishPractice, savePracticeAnswer, useAfterPractice, usePractice, type PracticeData, type PracticeQuestion } from '@/features/practice/practice'
import { QuestionCard } from '@/features/practice/QuestionCard'
import { need, useDataSource } from '@/lib/dataSource'

/** Questions in one session. */
const SESSION_LENGTH = 10

interface Session {
  quizId: string
  startedAt: Date
  startRating: number
  rating: number
  answers: number
  current: PracticeQuestion
  /** Was the current question right? null while it isn't answered yet. */
  result: boolean | null
  done: { question: PracticeQuestion; right: boolean }[]
}

/** Academics → a subject → Practice: questions picked for about 70% success, which adapt as you answer. */
export function PracticePage() {
  const { subjectId } = useParams()
  const subject = useSubject(subjectId)
  const practice = usePractice(subjectId)
  const { source } = useDataSource()
  const afterPractice = useAfterPractice()
  const [session, setSession] = useState<Session | null>(null)
  const [finished, setFinished] = useState<Session | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
      <Link to={subjectId ? `/academics/subjects/${subjectId}` : '/academics'}>
        <ArrowLeft aria-hidden />
        {subject.data?.name ?? 'Subject'}
      </Link>
    </Button>
  )

  if (practice.isPending || subject.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading…
      </p>
    )
  }
  if (practice.isError || !practice.data || !subject.data || !subjectId) {
    return (
      <>
        {back}
        <p role="alert" className="text-sm text-destructive">
          {practice.error?.message ?? 'This subject was not found.'}
        </p>
      </>
    )
  }
  const data = practice.data

  function next(from: PracticeData, current: Session | null): PracticeQuestion | null {
    const skip = new Set(current ? [...current.done.map((item) => item.question.id), current.current.id] : [])
    return pickNext(from.questions, current?.rating ?? from.rating, { skip, lastAnswered: from.lastAnswered, now: Date.now() })
  }

  function start() {
    const first = next(data, null)
    if (!first) return
    setError(null)
    setFinished(null)
    setSession({ quizId: crypto.randomUUID(), startedAt: new Date(), startRating: data.rating, rating: data.rating, answers: data.answers, current: first, result: null, done: [] })
  }

  async function answer(current: Session, { given, right, timeMs }: { given: string; right: boolean; timeMs: number }) {
    setSaving(true)
    setError(null)
    try {
      const saved = await savePracticeAnswer(need(source), {
        subjectId: subjectId ?? '',
        quizId: current.quizId,
        firstAnswer: current.done.length === 0,
        startedAt: current.startedAt,
        question: current.current,
        given,
        right,
        timeMs,
        rating: current.rating,
        answers: current.answers,
      })
      setSession({ ...current, rating: saved.rating, answers: current.answers + 1, result: right })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The answer was not saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function finish(current: Session) {
    const done = current.result === null ? current.done : [...current.done, { question: current.current, right: current.result }]
    const ended = { ...current, done, result: null }
    setSession(null)
    setFinished(ended)
    if (done.length > 0) {
      try {
        await finishPractice(need(source), { quizId: current.quizId, score: done.filter((item) => item.right).length / done.length })
      } catch {
        // The answers are saved already; only the session's end time and score are missing.
      }
    }
    await afterPractice()
  }

  function goOn(current: Session) {
    if (current.result === null) return
    const withThis = { ...current, done: [...current.done, { question: current.current, right: current.result }] }
    const following = withThis.done.length < SESSION_LENGTH ? next(data, { ...withThis, current: current.current }) : null
    if (!following) {
      void finish({ ...withThis, result: null })
      return
    }
    setSession({ ...withThis, current: following, result: null })
  }

  if (session) {
    const number = session.done.length + 1
    const total = Math.min(SESSION_LENGTH, data.questions.length)
    return (
      <>
        {back}
        <PageHeader title={`Practice: ${subject.data.name}`} subtitle={`Rating ${Math.round(session.rating)} · ${ratingLabel(session.rating)}`} />
        <QuestionCard
          key={session.current.id}
          question={session.current}
          label={`Question ${number} of ${total}`}
          result={session.result}
          saving={saving}
          error={error}
          onAnswer={(given) => void answer(session, given)}
          onNext={() => goOn(session)}
          nextLabel={number >= total ? 'See my result' : 'Next question'}
          onStop={() => void finish(session)}
        />
      </>
    )
  }

  if (finished) {
    const right = finished.done.filter((item) => item.right).length
    const change = Math.round(finished.rating - finished.startRating)
    return (
      <>
        {back}
        <PageHeader title={`Practice: ${subject.data.name}`} />
        <Card>
          <CardHeader>
            <CardTitle>{finished.done.length === 0 ? 'No questions answered' : `${right} of ${finished.done.length} right`}</CardTitle>
            <CardDescription>
              Rating {Math.round(finished.startRating)} → {Math.round(finished.rating)} ({change >= 0 ? `+${change}` : change}): {ratingLabel(finished.rating)}. The next session
              starts where this one left off.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ul className="grid gap-1.5 text-sm">
              {finished.done.map((item) => (
                <li key={item.question.id} className="flex items-start gap-2">
                  {item.right ? <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="Right" /> : <X className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Wrong" />}
                  <span className="line-clamp-2">{item.question.prompt}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button onClick={start} disabled={data.questions.length === 0}>
                <Target aria-hidden />
                Practise again
              </Button>
              {finished.done.some((item) => !item.right) && (
                <Button asChild variant="outline">
                  <Link to="/academics/mistakes">Mistake notebook</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </>
    )
  }

  return (
    <>
      {back}
      <PageHeader title={`Practice: ${subject.data.name}`} subtitle="Questions picked so you get about 7 in 10 right: hard enough to grow, easy enough to keep going." />
      <Card>
        <CardHeader>
          <CardTitle>
            Your rating: {Math.round(data.rating)} · {ratingLabel(data.rating)}
          </CardTitle>
          <CardDescription>
            {data.answers === 0
              ? 'Everyone starts at 1000. It goes up with right answers (more for hard questions) and down with wrong ones.'
              : `From ${data.answers} ${data.answers === 1 ? 'answer' : 'answers'}. Right answers on hard questions raise it most.`}{' '}
            {data.questions.length} {data.questions.length === 1 ? 'question' : 'questions'} to practise with.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {data.questions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No questions yet. Each topic's lesson comes with check questions: open a topic and tap Make my lesson, then come back.
            </p>
          ) : (
            <Button className="justify-self-start" onClick={start}>
              <Target aria-hidden />
              Start ({Math.min(SESSION_LENGTH, data.questions.length)} questions)
            </Button>
          )}
        </CardContent>
      </Card>
    </>
  )
}
