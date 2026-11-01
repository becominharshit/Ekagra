import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Check, LoaderCircle, NotebookPen, ShieldCheck, X } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAcademicsMutation, useSubjects } from '@/features/academics/subjects'
import { givenText, isRight, rightAnswerText } from '@/features/lessons/quiz'
import { noteMistake } from '@/features/mistakes/mistakes'
import { useBlocks } from '@/features/planner/planBlocks'
import { blockAt, localDateOf, localToIso, type PlanBlock } from '@/features/planner/schedule'
import { useProfile } from '@/features/profile/queries'
import { readSettings } from '@/features/profile/settings'
import { useNow } from '@/hooks/useNow'
import { useDataSource } from '@/lib/dataSource'
import { distractionsKey, useDistractions } from './distractions'
import { useFocusStore } from './focusStore'
import { useActiveFocus } from './sessions'
import {
  pickQuestions,
  saveTollbooth,
  SECONDS_PER_QUESTION,
  tollboothMistake,
  tollboothStatus,
  useSaveTollbooth,
  useTollboothPool,
  type TollboothAnswer,
  type TollboothQuestion,
} from './tollbooth'

type Step =
  | { kind: 'intro' }
  | { kind: 'question'; questions: TollboothQuestion[]; answers: TollboothAnswer[]; startedAt: number; shownAt: number }
  | { kind: 'reason'; questions: TollboothQuestion[]; answers: TollboothAnswer[]; startedAt: number }
  | { kind: 'unlocked'; until: string }
  | { kind: 'failed'; missed: TollboothAnswer }

const QUICK_REASONS = ['Reply to a class or project message', 'A call or message from family', 'Something I need for this study session']
const isOpen = (block: PlanBlock) => block.status === 'planned' || block.status === 'in_progress'

/** The Academic Tollbooth: questions from the current subject, then a reason, for a few minutes with blocked apps. */
export function TollboothFlow({ appPackage, appLabel }: { appPackage: string | null; appLabel: string | null }) {
  const now = useNow(1000)
  const today = localDateOf(now)
  const focus = useActiveFocus()
  const blocks = useBlocks(today, today)
  const subjects = useSubjects()
  const profile = useProfile()
  const settings = readSettings(profile.data?.settings).tollbooth
  const pool = useTollboothPool()
  const events = useDistractions(localToIso(today, 0))
  const save = useSaveTollbooth()
  const addToNotebook = useAcademicsMutation(noteMistake)
  const setPass = useFocusStore((state) => state.setPass)
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>({ kind: 'intro' })
  const [typed, setTyped] = useState('')
  const [reason, setReason] = useState('')

  const session = focus.data ?? null
  // The subject being studied: the focus session's, else the plan block's of right now.
  const subjectId = session?.subject_id ?? blockAt((blocks.data ?? []).filter(isOpen), now)?.subject_id ?? null
  const subjectName = subjects.data?.find((subject) => subject.id === subjectId)?.name
  const status = tollboothStatus(events.data ?? [], { dayStart: new Date(localToIso(today, 0)), now, dailyLimit: settings.dailyLimit })
  const appName = appLabel ?? 'blocked apps'
  const back = () => void navigate(session ? '/today/focus' : '/today')

  function start() {
    if (!pool.data) return
    const time = Date.now()
    setTyped('')
    setStep({ kind: 'question', questions: pickQuestions(pool.data, subjectId, time, settings.questions), answers: [], startedAt: time, shownAt: time })
  }

  /** An answer ('' = the time ran out): right moves on, wrong ends the try. */
  function answer(given: string) {
    if (step.kind !== 'question') return
    const question = step.questions[step.answers.length]
    if (!question) return
    const answered: TollboothAnswer = { question, given, right: given !== '' && isRight(question, given), timeMs: Date.now() - step.shownAt }
    const answers = [...step.answers, answered]
    setTyped('')
    if (!answered.right) {
      setStep({ kind: 'failed', missed: answered })
      save.mutate({ subjectId, sessionId: session?.id ?? null, appPackage, questions: step.questions, answers, reason: null, unlockMinutes: settings.unlockMinutes, startedAt: new Date(step.startedAt) })
      return
    }
    if (answers.length === step.questions.length) setStep({ kind: 'reason', questions: step.questions, answers, startedAt: step.startedAt })
    else setStep({ ...step, answers, shownAt: Date.now() })
  }

  function unlock() {
    if (step.kind !== 'reason' || reason.trim().length < 3) return
    save.mutate(
      { subjectId, sessionId: session?.id ?? null, appPackage, questions: step.questions, answers: step.answers, reason, unlockMinutes: settings.unlockMinutes, startedAt: new Date(step.startedAt) },
      {
        onSuccess: (until) => {
          if (!until) return
          setPass({ until, app: appLabel })
          setStep({ kind: 'unlocked', until })
        },
      },
    )
  }

  // Each question has 20 seconds; when they run out, it counts as a wrong answer. The timer is set
  // again after every render (no dependency list), so it always answers with the latest state.
  const shownAt = step.kind === 'question' ? step.shownAt : null
  useEffect(() => {
    if (shownAt === null) return
    const timer = window.setTimeout(() => answer(''), Math.max(0, shownAt + SECONDS_PER_QUESTION * 1000 - Date.now()))
    return () => window.clearTimeout(timer)
  })

  // Leaving in the middle of the questions counts as a wrong try, so nobody skips to easier ones.
  const onLeave = useRef<() => void>(() => undefined)
  useEffect(() => {
    onLeave.current = () => {
      if (step.kind !== 'question' || !source) return
      const attempt = { subjectId, sessionId: session?.id ?? null, appPackage, questions: step.questions, answers: step.answers, reason: null, unlockMinutes: settings.unlockMinutes, startedAt: new Date(step.startedAt) }
      void saveTollbooth(source, attempt)
        .then(() => queryClient.invalidateQueries({ queryKey: distractionsKey(owner) }))
        .catch(() => undefined)
    }
  })
  useEffect(() => () => onLeave.current(), [])

  const errorLine = save.error && (
    <p role="alert" className="text-sm text-destructive">
      {save.error.message}
    </p>
  )

  if (step.kind === 'question') {
    const index = step.answers.length
    const question = step.questions[index]
    if (!question) return null
    const left = Math.min(SECONDS_PER_QUESTION, Math.max(0, Math.ceil((step.shownAt + SECONDS_PER_QUESTION * 1000 - now.getTime()) / 1000)))
    return (
      <Card>
        <CardHeader>
          <CardDescription className="flex justify-between gap-3">
            <span>
              Question {index + 1} of {step.questions.length}
              {subjectName && question.origin !== 'builtin' ? ` · ${subjectName}` : ''}
            </span>
            <span className="tabular-nums">{left} s</span>
          </CardDescription>
          <div role="progressbar" aria-label="Time left" aria-valuemin={0} aria-valuemax={SECONDS_PER_QUESTION} aria-valuenow={left} className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear" style={{ width: `${(left / SECONDS_PER_QUESTION) * 100}%` }} />
          </div>
          <CardTitle className="pt-2 text-lg leading-snug">{question.prompt}</CardTitle>
        </CardHeader>
        <CardContent>
          {question.type === 'mcq' ? (
            <div className="grid gap-2">
              {question.options.map((option, optionIndex) => (
                <Button key={optionIndex} variant="outline" className="h-auto justify-start py-3 text-left whitespace-normal" onClick={() => answer(String(optionIndex))}>
                  {option}
                </Button>
              ))}
            </div>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                if (typed.trim()) answer(typed)
              }}
            >
              <Input aria-label="Your answer" inputMode="decimal" className="w-40" value={typed} onChange={(event) => setTyped(event.target.value)} />
              <Button type="submit" disabled={!typed.trim()}>
                Check
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    )
  }

  if (step.kind === 'reason') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Check className="size-5" aria-hidden />
            {step.questions.length} of {step.questions.length} right
          </CardTitle>
          <CardDescription>Last step: why do you need {appName} now? Saying it often answers it.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Input aria-label="Why you need it" placeholder="e.g. Reply to the project group" maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} />
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REASONS.map((quick) => (
              <Button key={quick} size="xs" variant="outline" onClick={() => setReason(quick)}>
                {quick}
              </Button>
            ))}
          </div>
          {errorLine}
          <div className="flex flex-wrap gap-2">
            <Button onClick={back}>Back to study instead</Button>
            <Button variant="outline" disabled={reason.trim().length < 3 || save.isPending} onClick={unlock}>
              {save.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
              Unlock for {settings.unlockMinutes} minutes
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (step.kind === 'unlocked') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Check className="size-5" aria-hidden />
            Open until {format(new Date(step.until), 'HH:mm')}
          </CardTitle>
          <CardDescription>
            {appName === 'blocked apps' ? 'Blocked apps are' : `${appName} is`} open for {settings.unlockMinutes} minutes, then the block comes back. {status.left} emergency{' '}
            {status.left === 1 ? 'unlock' : 'unlocks'} left today.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={back}>Back to study</Button>
        </CardContent>
      </Card>
    )
  }

  if (step.kind === 'failed') {
    const { missed } = step
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <X className="size-5" aria-hidden />
            Not this time
          </CardTitle>
          <CardDescription>Blocked apps stay closed. You can try again in a minute, or better: back to study.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p className="font-medium">{missed.question.prompt}</p>
          <p>{missed.given === '' ? 'The 20 seconds ran out.' : `You answered: ${givenText(missed.question, missed.given)}`}</p>
          <p>
            The answer: <span className="font-medium">{rightAnswerText(missed.question)}</span>
          </p>
          {missed.question.explanation && <p className="text-muted-foreground">{missed.question.explanation}</p>}
          {errorLine}
          {addToNotebook.error && (
            <p role="alert" className="text-destructive">
              {addToNotebook.error.message}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={back}>Back to study</Button>
            {missed.question.origin !== 'builtin' && (
              <Button variant="outline" disabled={addToNotebook.isPending || addToNotebook.isSuccess} onClick={() => addToNotebook.mutate(tollboothMistake(missed))}>
                <NotebookPen aria-hidden />
                {addToNotebook.isSuccess ? 'In your Mistake Notebook' : 'Add to Mistake Notebook'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5" aria-hidden />
          Academic Tollbooth
        </CardTitle>
        <CardDescription>
          To open {appName}, answer {settings.questions} quick questions {subjectName ? `from ${subjectName}` : 'from your subjects'} ({SECONDS_PER_QUESTION} seconds each), then say
          why. All right: they open for {settings.unlockMinutes} minutes.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm">
          {status.left > 0
            ? `${status.left} of ${settings.dailyLimit} emergency unlocks left today.`
            : `No emergency unlocks left today (${status.used} of ${settings.dailyLimit} used). The block stays until the session ends.`}
        </p>
        {status.wait > 0 && status.left > 0 && <p className="text-sm text-amber-700 dark:text-amber-400">After a wrong answer, wait {status.wait} s before trying again.</p>}
        {!Capacitor.isNativePlatform() && (
          <p className="text-xs text-muted-foreground">Apps are only blocked in the Android app. Here the Tollbooth is practice, but an unlock still counts for today.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={back}>Back to study</Button>
          <Button variant="outline" disabled={!pool.data || status.left === 0 || status.wait > 0} onClick={start}>
            {pool.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
            Answer {settings.questions} questions
          </Button>
        </div>
        {pool.error && (
          <p role="alert" className="text-sm text-destructive">
            {pool.error.message}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
