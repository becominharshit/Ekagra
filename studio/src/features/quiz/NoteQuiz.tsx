import { useState } from 'react'
import { Check, LoaderCircle, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAcademicsMutation } from '@/features/academics/subjects'
import { CheckQuiz } from '@/features/lessons/CheckQuiz'
import type { QuizAnswer } from '@/features/lessons/lessons'
import type { StoredCheckQuestion } from '@/features/lessons/quiz'
import type { Note } from '@/features/notes/notes'
import { useProfile } from '@/features/profile/queries'
import { makeQuiz, saveQuizResult, useNoteQuestions } from './quiz'

type Stage = { name: 'idle' } | { name: 'asking'; questions: StoredCheckQuestion[]; startedAt: Date } | { name: 'done'; questions: StoredCheckQuestion[]; score: number; answers: QuizAnswer[] }

/** Only called from clicks and callbacks, never while drawing (like SpeakingTab's nowMs). */
const now = () => new Date()

/** Under a note: test yourself with multiple-choice questions made from it. The answers count in Ekagra. */
export function NoteQuiz({ note }: { note: Note }) {
  const profile = useProfile()
  const saved = useNoteQuestions(note.id)
  const make = useAcademicsMutation(makeQuiz)
  const save = useAcademicsMutation(saveQuizResult)
  const [stage, setStage] = useState<Stage>({ name: 'idle' })

  function ask(questions: StoredCheckQuestion[]) {
    save.reset()
    setStage({ name: 'asking', questions, startedAt: now() })
  }

  function makeNew(count: number) {
    make.mutate({ note, count, program: profile.data?.program, year: profile.data?.year }, { onSuccess: (questions) => ask(questions) })
  }

  if (stage.name === 'asking') {
    return (
      <section className="mt-8 max-w-3xl">
        <CheckQuiz
          questions={stage.questions}
          saving={save.isPending}
          error={save.error?.message ?? null}
          onCancel={() => setStage({ name: 'idle' })}
          onFinish={(answers) =>
            save.mutate(
              { note, answers, startedAt: stage.startedAt },
              { onSuccess: (score) => setStage({ name: 'done', questions: stage.questions, score, answers }) },
            )
          }
        />
      </section>
    )
  }

  if (stage.name === 'done') {
    const right = stage.answers.filter((answer) => answer.right).length
    const wrong = stage.answers.length - right
    return (
      <section className="mt-8 grid max-w-3xl gap-4 rounded-xl border bg-card p-4">
        <div>
          <h2 className="font-heading text-lg font-medium">
            {right} of {stage.answers.length} right ({Math.round(stage.score * 100)}%)
          </h2>
          <p className="text-sm text-muted-foreground">
            {wrong === 0
              ? 'All right. This counts in your progress in Ekagra.'
              : wrong === 1
                ? "The wrong answer is in Ekagra's mistake notebook with the right answer, and comes back tomorrow. This counts in your progress there."
                : `The ${wrong} wrong answers are in Ekagra's mistake notebook with the right answers, and come back tomorrow. This counts in your progress there.`}
          </p>
        </div>
        <ul className="grid gap-1.5 text-sm">
          {stage.answers.map((answer) => (
            <li key={answer.question.id} className="flex items-start gap-2">
              {answer.right ? <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="Right" /> : <X className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Wrong" />}
              <span className="line-clamp-2">{answer.question.prompt}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => ask(stage.questions)}>Try again</Button>
          <Button variant="outline" onClick={() => setStage({ name: 'idle' })}>
            Back to the note
          </Button>
        </div>
      </section>
    )
  }

  const savedCount = saved.data?.length ?? 0
  return (
    <section className="mt-8 grid max-w-3xl gap-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="font-heading font-medium">Test yourself</h2>
        <p className="text-sm text-muted-foreground">
          Multiple-choice questions made from this note. Your answers count in Ekagra's progress, and wrong ones go to its mistake notebook.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {[5, 10].map((count) => (
          <Button key={count} variant={savedCount > 0 ? 'outline' : 'default'} disabled={make.isPending} onClick={() => makeNew(count)}>
            {make.isPending && make.variables?.count === count ? <LoaderCircle className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            {savedCount > 0 ? `${count} new questions` : `${count} questions`}
          </Button>
        ))}
        {savedCount > 0 && <Button onClick={() => ask(saved.data ?? [])}>Practise the {savedCount} saved questions</Button>}
      </div>
      {make.isPending && <p className="text-sm text-muted-foreground">Gemini is writing the questions. This takes a few seconds.</p>}
      {make.error && (
        <p role="alert" className="text-sm text-destructive">
          {make.error.message}
        </p>
      )}
    </section>
  )
}
