import { useState } from 'react'
import { LoaderCircle, NotebookPen, RotateCcw } from 'lucide-react'
import { Link } from 'react-router'
import { Markdown } from '@/components/Markdown'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { minutesLabel } from '@/features/academics/labels'
import { cn } from '@/lib/utils'
import type { MockProgress } from './mockTest'
import { isAutoMarked, SECTION_LABEL, type MockQuestion } from './pattern'
import { marksText, PASS_SHARE, scoreMock, topicBreakdown, type MarkedBy, type MockMark } from './scoring'

const BY_LABEL: Record<MarkedBy, string> = {
  app: 'Marked by the app',
  ai: 'Marked by the AI',
  device: 'Rough mark from your device',
  self: 'Your mark',
}

interface MockResultsProps {
  progress: MockProgress
  topicTitles: ReadonlyMap<string, string>
  /** After saving the marks can't be changed any more. */
  saved: boolean
  saving: boolean
  error: string | null
  onMark: (questionId: string, awarded: number) => void
  onSave: () => void
  onDiscard: () => void
  onNew: () => void
}

/** The marked test: the score, marks per topic (weakest first) and every answer with feedback. */
export function MockResults({ progress, topicTitles, saved, saving, error, onMark, onSave, onDiscard, onNew }: MockResultsProps) {
  const marks = progress.marks ?? {}
  const score = scoreMock(progress.questions, marks)
  const topics = topicBreakdown(progress.questions, marks)
  const used = progress.finishedAt ? Math.min(progress.minutes, Math.ceil((Date.parse(progress.finishedAt) - Date.parse(progress.startedAt)) / 60_000)) : progress.minutes
  const markers = new Set(Object.values(marks).map((mark) => mark.by))
  // A real rough mark: the device compared an answer with key points or a model answer.
  const roughMarks = progress.questions.some((question) => {
    const mark = marks[question.id]
    return mark?.by === 'device' && mark.awarded !== null && (progress.answers[question.id] ?? '').trim() !== ''
  })

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            {marksText(score.awarded)} of {marksText(score.total)} marks
            <Badge variant="secondary" className="text-sm">
              {Math.round(score.share * 100)}%
            </Badge>
          </CardTitle>
          <CardDescription>
            Time used: {minutesLabel(Math.max(1, used))} of {minutesLabel(progress.minutes)}.
            {markers.has('ai') && ' The AI marked the written answers like an examiner.'}
            {roughMarks && ' Some written answers got a rough mark from your device (matching key words): check them against the model answers.'}
            {!saved && progress.questions.some((question) => !isAutoMarked(question)) && ' You can change any written mark before saving.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {progress.aiError && (
            <p className="rounded-lg bg-muted/50 p-3">
              The AI couldn't mark your written answers ({progress.aiError}), so your device marked them instead.
            </p>
          )}
          {score.unmarked > 0 && !saved && (
            <p className="rounded-lg bg-mode-hustle/15 p-3">
              {score.unmarked === 1 ? 'One answer needs' : `${score.unmarked} answers need`} your mark: there was nothing to compare with. Read the question, look at your answer and give the marks you'd expect.
            </p>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          {saved ? (
            <>
              <p role="status">Saved. Answers under half marks are in your mistake notebook, with what to add next time.</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={onNew}>
                  <RotateCcw aria-hidden />
                  New mock test
                </Button>
                <Button asChild variant="outline">
                  <Link to="/academics/mistakes">
                    <NotebookPen aria-hidden />
                    Mistake notebook
                  </Link>
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button disabled={score.unmarked > 0 || saving} onClick={onSave}>
                {saving && <LoaderCircle className="animate-spin" aria-hidden />}
                Save result
              </Button>
              <Button variant="ghost" disabled={saving} onClick={onDiscard}>
                Throw away
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By topic</CardTitle>
          <CardDescription>Weakest first: revise the top ones before the exam.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2.5 text-sm">
            {topics.map((topic) => {
              const share = topic.marks > 0 ? topic.awarded / topic.marks : 0
              const title = topic.topicId ? (topicTitles.get(topic.topicId) ?? 'A deleted topic') : 'Not matched to a topic'
              return (
                <li key={topic.topicId ?? 'none'} className="grid gap-1">
                  <div className="flex items-baseline justify-between gap-2">
                    {topic.topicId && topicTitles.has(topic.topicId) ? (
                      <Link to={`/academics/topics/${topic.topicId}`} className="min-w-0 truncate underline-offset-4 hover:underline">
                        {title}
                      </Link>
                    ) : (
                      <span className="min-w-0 truncate">{title}</span>
                    )}
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {marksText(topic.awarded)} / {marksText(topic.marks)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div className={cn('h-full rounded-full', share >= PASS_SHARE ? 'bg-mode-life' : 'bg-destructive')} style={{ width: `${Math.round(share * 100)}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your answers</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          {progress.questions.map((question, index) => (
            <AnswerReview
              key={question.id}
              number={index + 1}
              question={question}
              given={progress.answers[question.id] ?? ''}
              mark={marks[question.id]}
              editable={!saved && !isAutoMarked(question)}
              onMark={(awarded) => onMark(question.id, awarded)}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function AnswerReview({
  number,
  question,
  given,
  mark,
  editable,
  onMark,
}: {
  number: number
  question: MockQuestion
  given: string
  mark: MockMark | undefined
  editable: boolean
  onMark: (awarded: number) => void
}) {
  const awarded = mark?.awarded ?? null
  const share = awarded === null ? null : awarded / question.marks
  const check = question.check
  // An empty answer isn't option 0 (Number('') is 0).
  const shownAnswer = check?.type === 'mcq' && given.trim() ? (check.options[Number(given)] ?? '') : given

  return (
    <section className="grid gap-2 border-t pt-4 text-sm first:border-t-0 first:pt-0" aria-label={`Question ${number}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Question {number} · {SECTION_LABEL[question.type]}
          {mark && ` · ${mark.awarded === null ? 'Needs your mark' : BY_LABEL[mark.by]}`}
        </p>
        {editable ? (
          <MarkInput number={number} marks={question.marks} awarded={awarded} onMark={onMark} />
        ) : (
          <Badge
            variant="secondary"
            className={cn('shrink-0 tabular-nums', share !== null && share >= 1 && 'bg-mode-life/15 text-mode-life', share !== null && share < PASS_SHARE && 'bg-destructive/10 text-destructive')}
          >
            {awarded === null ? '–' : marksText(awarded)} / {marksText(question.marks)}
          </Badge>
        )}
      </div>
      <div className="font-medium">
        <Markdown>{question.prompt}</Markdown>
      </div>
      <div className="rounded-lg bg-muted/40 p-3">
        <p className="mb-1 text-xs text-muted-foreground">Your answer</p>
        {shownAnswer.trim() ? <p className={cn('whitespace-pre-wrap', question.type === 'code' && 'font-mono text-xs')}>{shownAnswer}</p> : <p className="text-muted-foreground">(no answer)</p>}
      </div>
      {mark?.feedback && <Markdown>{mark.feedback}</Markdown>}
      {mark && mark.missing.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground">Points to add</p>
          <ul className="list-disc pl-5">
            {mark.missing.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
      )}
      {mark?.modelAnswer &&
        (isAutoMarked(question) ? (
          <p>
            <span className="text-muted-foreground">Right answer: </span>
            {mark.modelAnswer}
          </p>
        ) : (
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-xs font-medium">Model answer</summary>
            <div className="mt-2">
              <Markdown>{mark.modelAnswer}</Markdown>
            </div>
          </details>
        ))}
    </section>
  )
}

/** Marks for a written answer, in steps of 0.5. What's typed stays as typed; the mark changes once it's a valid number. */
function MarkInput({ number, marks, awarded, onMark }: { number: number; marks: number; awarded: number | null; onMark: (awarded: number) => void }) {
  const [text, setText] = useState(awarded === null ? '' : String(awarded))

  function change(next: string) {
    setText(next)
    const value = Number(next.replace(',', '.'))
    if (next.trim() === '' || !Number.isFinite(value) || value < 0) return
    onMark(Math.min(marks, Math.round(value * 2) / 2))
  }

  return (
    <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        max={marks}
        step="0.5"
        aria-label={`Marks for question ${number}, out of ${marksText(marks)}`}
        className={cn('h-8 w-20 tabular-nums', awarded === null && 'border-mode-hustle')}
        placeholder="?"
        value={text}
        onChange={(event) => change(event.target.value)}
        onBlur={() => setText(awarded === null ? '' : String(awarded))}
      />
      / {marksText(marks)}
    </label>
  )
}
