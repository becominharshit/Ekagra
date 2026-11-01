import { useEffect, useRef, useState } from 'react'
import { Check, LoaderCircle, X } from 'lucide-react'
import { Markdown } from '@/components/Markdown'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { isRight, rightAnswerText, type StoredCheckQuestion } from '@/features/lessons/quiz'
import { cn } from '@/lib/utils'

interface QuestionCardProps {
  question: StoredCheckQuestion
  /** e.g. "Question 3 of 10" */
  label: string
  /** Set once the answer is saved: was it right? */
  result: boolean | null
  saving: boolean
  error: string | null
  onAnswer: (answer: { given: string; right: boolean; timeMs: number }) => void
  onNext: () => void
  nextLabel: string
  onStop: () => void
}

/** One question: mcq and numbers are checked by the app; short answers you mark yourself against the model answer. */
export function QuestionCard({ question, label, result, saving, error, onAnswer, onNext, nextLabel, onStop }: QuestionCardProps) {
  const [given, setGiven] = useState('')
  const [revealed, setRevealed] = useState(false)
  const shownAt = useRef(0)
  const done = result !== null

  useEffect(() => {
    shownAt.current = performance.now()
  }, [question.id])

  const answer = (right: boolean) => {
    if (!done && !saving) onAnswer({ given, right, timeMs: performance.now() - shownAt.current })
  }

  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-base leading-relaxed">
          <Markdown>{question.prompt}</Markdown>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {question.type === 'mcq' && (
          <div className="grid gap-2" role="radiogroup" aria-label="Options">
            {question.options.map((option, optionIndex) => {
              const chosen = given === String(optionIndex)
              const isAnswer = optionIndex === question.correct
              return (
                <button
                  key={`${optionIndex}-${option}`}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  disabled={done || saving}
                  className={cn(
                    'rounded-lg border p-3 text-left text-sm transition-colors',
                    !done && chosen && 'border-primary bg-primary/5',
                    !done && !chosen && 'hover:bg-muted/40',
                    done && isAnswer && 'border-emerald-600 bg-emerald-600/10',
                    done && chosen && !isAnswer && 'border-destructive bg-destructive/10',
                  )}
                  onClick={() => setGiven(String(optionIndex))}
                >
                  {option}
                </button>
              )
            })}
          </div>
        )}

        {question.type === 'numerical' && (
          <Input
            inputMode="decimal"
            aria-label="Your answer"
            placeholder="Your answer (a number)"
            disabled={done || saving}
            value={given}
            onChange={(event) => setGiven(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && given.trim()) answer(isRight(question, given))
            }}
          />
        )}

        {question.type === 'short' && (
          <Textarea
            aria-label="Your answer"
            rows={4}
            placeholder="Write your answer (or think it through), then compare it with the model answer."
            disabled={revealed}
            value={given}
            onChange={(event) => setGiven(event.target.value)}
          />
        )}
        {question.type === 'short' && revealed && (
          <div className="grid gap-2 rounded-lg bg-muted/40 p-3 text-sm">
            <p className="font-medium">Model answer</p>
            <Markdown>{question.model}</Markdown>
            {question.keyPoints.length > 0 && (
              <ul className="list-disc pl-5">
                {question.keyPoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {done && question.type !== 'short' && (
          <div className={cn('grid gap-1 rounded-lg p-3 text-sm', result ? 'bg-emerald-600/10' : 'bg-destructive/10')}>
            <p className="font-medium">{result ? 'Right!' : `Not quite. The answer is ${rightAnswerText(question)}.`}</p>
            {question.explanation && <Markdown>{question.explanation}</Markdown>}
          </div>
        )}
        {done && !result && <p className="text-sm text-muted-foreground">It's in your mistake notebook now, with the right approach.</p>}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {!done && question.type !== 'short' && (
            <Button disabled={!given.trim() || saving} onClick={() => answer(isRight(question, given))}>
              {saving && <LoaderCircle className="animate-spin" aria-hidden />}
              Check
            </Button>
          )}
          {!done && question.type === 'short' && !revealed && <Button onClick={() => setRevealed(true)}>Show the model answer</Button>}
          {!done && question.type === 'short' && revealed && (
            <>
              <Button disabled={saving} onClick={() => answer(true)}>
                <Check aria-hidden />I had it
              </Button>
              <Button variant="outline" disabled={saving} onClick={() => answer(false)}>
                <X aria-hidden />I missed it
              </Button>
            </>
          )}
          {done && <Button onClick={onNext}>{nextLabel}</Button>}
          <Button variant="ghost" disabled={saving} onClick={onStop}>
            Stop
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
