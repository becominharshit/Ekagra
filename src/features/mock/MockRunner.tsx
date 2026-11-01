import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useNow } from '@/hooks/useNow'
import { cn } from '@/lib/utils'
import type { MockProgress } from './mockTest'
import { SECTION_LABEL, type MockQuestion } from './pattern'
import { marksText } from './scoring'

/** 3_909_000 → "1:05:09", 249_000 → "4:09" */
function clockLabel(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const two = (value: number) => String(value).padStart(2, '0')
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  return hours > 0 ? `${hours}:${two(minutes)}:${two(total % 60)}` : `${minutes}:${two(total % 60)}`
}

const isAnswered = (answers: Record<string, string>, question: MockQuestion) => (answers[question.id] ?? '').trim() !== ''

interface MockRunnerProps {
  progress: MockProgress
  onAnswer: (questionId: string, given: string) => void
  /** Moves to another question; `spentMs` is the time spent on the one being left. */
  onGo: (index: number, spentMs: number) => void
  onHandIn: (spentMs: number) => void
  onDiscard: () => void
}

/** The timed test: one question at a time, a question map, and a clock that hands the test in at zero. */
export function MockRunner({ progress, onAnswer, onGo, onHandIn, onDiscard }: MockRunnerProps) {
  const now = useNow(1000)
  const [confirm, setConfirm] = useState<'hand-in' | 'discard' | null>(null)
  const shownAt = useRef(0)
  const handedIn = useRef(false)
  const { questions, answers } = progress
  const index = Math.min(progress.current, questions.length - 1)
  const question = questions[index]
  const left = Date.parse(progress.startedAt) + progress.minutes * 60_000 - now.getTime()
  const unanswered = questions.filter((one) => !isAnswered(answers, one)).length

  useEffect(() => {
    shownAt.current = Date.now()
  }, [index])

  // Time's up: hand in what's there (also when the app comes back after the end).
  useEffect(() => {
    if (left > 0 || handedIn.current) return
    handedIn.current = true
    onHandIn(Math.max(0, Date.now() - shownAt.current))
  }, [left, onHandIn])

  if (!question) return null
  const go = (to: number) => onGo(to, Math.max(0, Date.now() - shownAt.current))
  const handIn = () => {
    handedIn.current = true
    onHandIn(Math.max(0, Date.now() - shownAt.current))
  }

  return (
    <div className="grid gap-4">
      <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-3 border-b bg-background/95 px-4 py-2 backdrop-blur">
        <p role="timer" aria-label="Time left" className={cn('flex items-center gap-1.5 font-heading text-lg font-semibold tabular-nums', left < 5 * 60_000 && 'text-destructive')}>
          <Clock className="size-4" aria-hidden />
          {clockLabel(left)}
        </p>
        <p className="text-sm text-muted-foreground">
          {questions.length - unanswered} of {questions.length} answered
        </p>
        <Button size="sm" onClick={() => setConfirm('hand-in')}>
          Hand in
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardDescription>
            Question {index + 1} of {questions.length} · {SECTION_LABEL[question.type]} · {marksText(question.marks)} {question.marks === 1 ? 'mark' : 'marks'}
          </CardDescription>
          <CardTitle className="text-base leading-relaxed">
            <Markdown>{question.prompt}</Markdown>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <AnswerField key={question.id} question={question} value={answers[question.id] ?? ''} onChange={(given) => onAnswer(question.id, given)} />
          <div className="flex justify-between gap-2">
            <Button variant="outline" disabled={index === 0} onClick={() => go(index - 1)}>
              <ChevronLeft aria-hidden />
              Previous
            </Button>
            {index < questions.length - 1 ? (
              <Button onClick={() => go(index + 1)}>
                Next
                <ChevronRight aria-hidden />
              </Button>
            ) : (
              <Button onClick={() => setConfirm('hand-in')}>Hand in</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Questions</CardTitle>
          <CardDescription>Filled ones are answered. Jump to any question.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap gap-1.5">
            {questions.map((one, at) => (
              <Button
                key={one.id}
                size="icon-sm"
                variant={isAnswered(answers, one) ? 'default' : 'outline'}
                aria-label={`Question ${at + 1}${isAnswered(answers, one) ? ', answered' : ''}`}
                aria-current={at === index ? 'step' : undefined}
                className={cn('tabular-nums', at === index && 'ring-2 ring-ring ring-offset-2 ring-offset-background')}
                onClick={() => go(at)}
              >
                {at + 1}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">The clock keeps running if you leave this screen. Your answers stay on this device until you hand in.</p>
          <Button variant="ghost" size="sm" className="justify-self-start text-destructive" onClick={() => setConfirm('discard')}>
            Throw this test away
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === 'discard' ? 'Throw this test away?' : 'Hand in now?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'discard'
                ? 'Your answers are deleted and nothing is saved.'
                : unanswered > 0
                  ? `${unanswered} ${unanswered === 1 ? 'question is' : 'questions are'} still unanswered and will get 0. Your answers are marked straight away.`
                  : 'Every question has an answer. They are marked straight away.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep going</AlertDialogCancel>
            {confirm === 'discard' ? (
              <AlertDialogAction variant="destructive" onClick={onDiscard}>
                Throw away
              </AlertDialogAction>
            ) : (
              <AlertDialogAction onClick={handIn}>Hand in</AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Multiple choice and numericals from lessons get options or a number box; everything else is written. */
function AnswerField({ question, value, onChange }: { question: MockQuestion; value: string; onChange: (given: string) => void }) {
  const check = question.check
  if (check?.type === 'mcq') {
    return (
      <div className="grid gap-2" role="radiogroup" aria-label="Options">
        {check.options.map((option, optionIndex) => {
          const chosen = value === String(optionIndex)
          return (
            <button
              key={`${optionIndex}-${option}`}
              type="button"
              role="radio"
              aria-checked={chosen}
              className={cn('rounded-lg border p-3 text-left text-sm transition-colors', chosen ? 'border-primary bg-primary/5' : 'hover:bg-muted/40')}
              // Tapping the chosen option again clears it.
              onClick={() => onChange(chosen ? '' : String(optionIndex))}
            >
              {option}
            </button>
          )
        })}
      </div>
    )
  }
  if (check?.type === 'numerical') {
    return <Input inputMode="decimal" aria-label="Your answer" placeholder="Your answer (a number)" value={value} onChange={(event) => onChange(event.target.value)} />
  }
  const code = question.type === 'code'
  return (
    <Textarea
      aria-label="Your answer"
      rows={question.marks >= 10 ? 12 : question.marks >= 5 ? 7 : 4}
      spellCheck={!code}
      className={cn(code && 'font-mono text-sm')}
      placeholder={code ? 'Write your program.' : 'Write your answer. Points are fine for long answers: the marker looks for the key ideas.'}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}
