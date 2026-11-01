import { useState } from 'react'
import { ArrowLeft, Layers, ListChecks, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { Markdown } from '@/components/Markdown'
import { PageHeader } from '@/components/layout/PageHeader'
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
import { countLabel, DIFFICULTY_LABEL, minutesLabel } from '@/features/academics/labels'
import { useAcademicsMutation } from '@/features/academics/subjects'
import { useAuthStore } from '@/features/auth/authStore'
import { CheckQuiz, QuizResult } from '@/features/lessons/CheckQuiz'
import { generateTopic, saveCheckQuiz, useTopicStudy, type QuizAnswer, type TopicStudy } from '@/features/lessons/lessons'
import { useProfile } from '@/features/profile/queries'
import { toMentorTone } from '@/features/profile/settings'

const DEMO_LESSON_NOTE = 'Demo Mode has no AI: this sample is made on your device from your roadmap. Sign in for a real lesson.'

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started',
  learning: 'Learning',
  review: 'Learned',
  mastered: 'Mastered',
}

/** Study one topic: lesson → check quiz → flashcards (wrong answers go to the mistake notebook). */
export function TopicPage() {
  const { topicId } = useParams()
  const study = useTopicStudy(topicId)

  if (study.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading…
      </p>
    )
  }
  if (!study.data) {
    return (
      <div className="grid gap-3">
        <p role="alert" className="text-sm text-destructive">
          {study.error?.message ?? 'This topic was not found.'}
        </p>
        <Button asChild variant="outline" className="justify-self-start">
          <Link to="/academics">Back to Academics</Link>
        </Button>
      </div>
    )
  }
  return <TopicView key={study.data.topic.id} study={study.data} />
}

function TopicView({ study }: { study: TopicStudy }) {
  const isDemo = useAuthStore((state) => state.status === 'demo')
  const profile = useProfile()
  const generate = useAcademicsMutation(generateTopic)
  const save = useAcademicsMutation(saveCheckQuiz)
  const [startedAt, setStartedAt] = useState<Date | null>(null)
  const [result, setResult] = useState<{ score: number; answers: QuizAnswer[] } | null>(null)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)

  const { topic, subject, unit, lesson } = study
  const learner = { program: profile.data?.program ?? null, year: profile.data?.year ?? null, mentorTone: toMentorTone(profile.data?.mentor_tone) }
  const remake = () => generate.mutate({ study, learner })
  const startQuiz = () => {
    setResult(null)
    save.reset()
    setStartedAt(new Date())
  }

  const facts = [
    topic.est_minutes !== null ? minutesLabel(topic.est_minutes) : null,
    topic.difficulty !== null ? DIFFICULTY_LABEL[topic.difficulty] : null,
    topic.pyq_count > 0 ? `asked ${topic.pyq_count}× in past papers` : null,
    STATUS_LABEL[topic.status] ?? topic.status,
    topic.status !== 'not_started' && study.lastQuiz ? `mastery ${Math.round(Number(topic.mastery) * 100)}%` : null,
  ].filter(Boolean)

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link to={`/academics/subjects/${subject.id}`}>
          <ArrowLeft aria-hidden />
          {subject.name}
        </Link>
      </Button>
      <PageHeader title={topic.title} subtitle={[unit?.title, topic.track === 'skill' ? 'Skill track' : null].filter(Boolean).join(' · ')} />
      <p className="-mt-3 mb-4 text-sm text-muted-foreground">{facts.join(' · ')}</p>
      {study.prerequisites.length > 0 && <p className="-mt-2 mb-4 text-sm text-muted-foreground">After: {study.prerequisites.join(', ')}</p>}

      {startedAt ? (
        <CheckQuiz
          questions={study.checkQuestions}
          saving={save.isPending}
          error={save.error?.message ?? null}
          onCancel={() => setStartedAt(null)}
          onFinish={(answers) =>
            save.mutate(
              { study, answers, startedAt },
              {
                onSuccess: (score) => {
                  setStartedAt(null)
                  setResult({ score, answers })
                },
              },
            )
          }
        />
      ) : result ? (
        <QuizResult score={result.score} answers={result.answers} onRetry={startQuiz} onBack={() => setResult(null)} />
      ) : !lesson ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4" aria-hidden />
              Study this topic
            </CardTitle>
            <CardDescription>
              The AI writes a lesson for this topic, a check quiz of 3–5 questions and flashcards. It's made once, when you get here, and
              saved.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {generate.error && (
              <p role="alert" className="text-sm text-destructive">
                {generate.error.message}
              </p>
            )}
            <Button className="justify-self-start" disabled={generate.isPending} onClick={remake}>
              {generate.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
              {generate.isPending ? 'Writing your lesson… (up to a minute)' : 'Make my lesson'}
            </Button>
            {isDemo && <p className="text-xs text-muted-foreground">{DEMO_LESSON_NOTE}</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          <Card>
            <CardContent>
              <Markdown>{lesson.content_md}</Markdown>
              <p className="mt-4 text-xs text-muted-foreground">
                {lesson.model === 'demo' ? DEMO_LESSON_NOTE : 'Written by the AI. Check anything that looks off against your notes.'}
              </p>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="size-4" aria-hidden />
                Check quiz
              </CardTitle>
              <CardDescription>
                {countLabel(study.checkQuestions.length, 'question')}.{' '}
                {study.lastQuiz?.score !== null && study.lastQuiz?.score !== undefined
                  ? `Last time: ${Math.round(Number(study.lastQuiz.score) * 100)}%.`
                  : 'Answer from memory, right after reading.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button disabled={study.checkQuestions.length === 0} onClick={startQuiz}>
                Start the check quiz
              </Button>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="size-4" aria-hidden />
                Flashcards
              </CardTitle>
              <CardDescription>{countLabel(study.cardCount, 'card')} for this topic. They come back just before you would forget them.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link to="/academics/review">Review flashcards</Link>
              </Button>
            </CardContent>
          </Card>

          {generate.error && (
            <p role="alert" className="text-sm text-destructive">
              {generate.error.message}
            </p>
          )}
          <Button variant="ghost" className="justify-self-start" disabled={generate.isPending} onClick={() => setConfirmRegenerate(true)}>
            {generate.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
            {generate.isPending ? 'Writing a new lesson…' : 'Make a new lesson'}
          </Button>
        </div>
      )}

      <AlertDialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make a new lesson?</AlertDialogTitle>
            <AlertDialogDescription>
              The lesson and the check quiz are replaced. Your flashcards for this topic stay as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep this one</AlertDialogCancel>
            <AlertDialogAction onClick={remake}>Make a new one</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
