import { useEffect, useRef, useState } from 'react'
import { Check, LoaderCircle, X } from 'lucide-react'
import { Link } from 'react-router'
import { Markdown } from '@/components/Markdown'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { QuizAnswer } from './lessons'
import { isRight, LEARNED_SCORE, rightAnswerText, type StoredCheckQuestion } from './quiz'

/** Milliseconds since `start` (a performance.now() reading). Only called from event handlers. */
const msSince = (start: number) => performance.now() - start

interface CheckQuizProps {
  questions: StoredCheckQuestion[]
  saving: boolean
  error: string | null
  onFinish: (answers: QuizAnswer[]) => void
  onCancel: () => void
}

/** The check quiz, one question at a time. mcq and numbers are checked; short answers you mark yourself. */
export function CheckQuiz({ questions, saving, error, onFinish, onCancel }: CheckQuizProps) {
  const [index, setIndex] = useState(0)
  const [given, setGiven] = useState('')
  const [result, setResult] = useState<boolean | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [answers, setAnswers] = useState<QuizAnswer[]>([])
  const shownAt = useRef(0)

  useEffect(() => {
    shownAt.current = performance.now()
  }, [index])

  const question = questions[index]
  if (!question) return null
  const last = index === questions.length - 1
  const done = result !== null

  function record(right: boolean) {
    if (!question || done) return
    setResult(right)
    setAnswers((previous) => [...previous, { question, given, right, timeMs: msSince(shownAt.current) }])
  }

  function next() {
    if (last) return onFinish(answers)
    setIndex(index + 1)
    setGiven('')
    setResult(null)
    setRevealed(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardDescription>
          Question {index + 1} of {questions.length}
        </CardDescription>
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
                  disabled={done}
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
            disabled={done}
            value={given}
            onChange={(event) => setGiven(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && given.trim()) record(isRight(question, given))
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
              <>
                <p className="font-medium">A good answer has</p>
                <ul className="list-disc pl-5">
                  {question.keyPoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {done && question.type !== 'short' && (
          <div className={cn('grid gap-1 rounded-lg p-3 text-sm', result ? 'bg-emerald-600/10' : 'bg-destructive/10')}>
            <p className="font-medium">{result ? 'Right!' : `Not quite. The answer is ${rightAnswerText(question)}.`}</p>
            {question.explanation && <Markdown>{question.explanation}</Markdown>}
          </div>
        )}
        {done && question.type === 'short' && question.explanation && <Markdown className="text-muted-foreground">{question.explanation}</Markdown>}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {!done && question.type !== 'short' && (
            <Button disabled={!given.trim()} onClick={() => record(isRight(question, given))}>
              Check
            </Button>
          )}
          {!done && question.type === 'short' && !revealed && <Button onClick={() => setRevealed(true)}>Show the model answer</Button>}
          {!done && question.type === 'short' && revealed && (
            <>
              <Button onClick={() => record(true)}>
                <Check aria-hidden />I had it
              </Button>
              <Button variant="outline" onClick={() => record(false)}>
                <X aria-hidden />I missed it
              </Button>
            </>
          )}
          {done && (
            <Button disabled={saving} onClick={next}>
              {saving && <LoaderCircle className="animate-spin" aria-hidden />}
              {last ? 'See my result' : 'Next question'}
            </Button>
          )}
          <Button variant="ghost" disabled={saving} onClick={onCancel}>
            Stop the quiz
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

interface QuizResultProps {
  score: number
  answers: QuizAnswer[]
  onRetry: () => void
  onBack: () => void
}

/** The score, which questions went wrong (now in the notebook) and where to go next. */
export function QuizResult({ score, answers, onRetry, onBack }: QuizResultProps) {
  const rightCount = answers.filter((answer) => answer.right).length
  const wrongCount = answers.length - rightCount
  const learned = score >= LEARNED_SCORE
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {rightCount} of {answers.length} right ({Math.round(score * 100)}%)
        </CardTitle>
        <CardDescription>
          {learned
            ? 'Topic learned! The plan moves on, and its flashcards keep it fresh from now on.'
            : `Not yet: the topic stays in your plan. Read the lesson again, then try once more (${Math.round(LEARNED_SCORE * 100)}% counts as learned).`}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ul className="grid gap-1.5 text-sm">
          {answers.map((answer) => (
            <li key={answer.question.id} className="flex items-start gap-2">
              {answer.right ? (
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="Right" />
              ) : (
                <X className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Wrong" />
              )}
              <span className="line-clamp-2">{answer.question.prompt}</span>
            </li>
          ))}
        </ul>
        {wrongCount > 0 && (
          <p className="text-sm text-muted-foreground">
            {wrongCount === 1
              ? 'The wrong answer is in your mistake notebook, with the right approach. It comes back tomorrow.'
              : `The ${wrongCount} wrong answers are in your mistake notebook, with the right approach. They come back tomorrow.`}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/academics/review">Review flashcards</Link>
          </Button>
          {wrongCount > 0 && (
            <Button asChild variant="outline">
              <Link to="/academics/mistakes">Mistake notebook</Link>
            </Button>
          )}
          <Button variant="outline" onClick={onBack}>
            Back to the lesson
          </Button>
          <Button variant="ghost" onClick={onRetry}>
            Try again
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
