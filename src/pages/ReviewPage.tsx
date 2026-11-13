import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Eye, Layers, LoaderCircle, PartyPopper } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Markdown } from '@/components/Markdown'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAcademicsMutation } from '@/features/academics/subjects'
import {
  recordReview,
  todaysQueue,
  useFlashcards,
  useReviewsToday,
  useScheduler,
  type FlashcardReview,
} from '@/features/flashcards/flashcards'
import {
  GRADE_LABEL,
  GRADES,
  intervalLabel,
  isLapse,
  isNew,
  previewIntervals,
  type Flashcard,
  type Grade,
  type Scheduler,
} from '@/features/flashcards/fsrs'
import { ImageOcclusionView } from '@/features/flashcards/ImageOcclusionView'
import { occlusionPrompt, parseOcclusionFront } from '@/features/flashcards/occlusion'
import { useProfile } from '@/features/profile/queries'
import { readSettings } from '@/features/profile/settings'
import { useNow } from '@/hooks/useNow'

/** Today's flashcards: look at the front, think, show the answer, rate how well you knew it. */
export function ReviewPage() {
  const now = useNow(15_000)
  const cards = useFlashcards()
  const reviews = useReviewsToday(now)
  const profile = useProfile()
  const settings = readSettings(profile.data?.settings)
  const scheduler = useScheduler(settings.learning.targetRetention)

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link to="/academics">
          <ArrowLeft aria-hidden />
          Academics
        </Link>
      </Button>
      <PageHeader title="Review" subtitle="Cards come back just before you would forget them." />
      {cards.isError || reviews.isError || scheduler.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {(cards.error ?? reviews.error ?? scheduler.error)?.message}
        </p>
      ) : !cards.data || !reviews.data || !scheduler.data ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Loading your cards…
        </p>
      ) : (
        <Session
          cards={cards.data}
          reviewsToday={reviews.data}
          scheduler={scheduler.data}
          newPerDay={settings.learning.newCardsPerDay}
          now={now}
        />
      )}
    </>
  )
}

/** Milliseconds since `start` (a performance.now() reading). Only called from event handlers. */
const msSince = (start: number) => performance.now() - start

interface SessionProps {
  cards: Flashcard[]
  reviewsToday: FlashcardReview[]
  scheduler: Scheduler
  newPerDay: number
  now: Date
}

function Session({ cards, reviewsToday, scheduler, newPerDay, now }: SessionProps) {
  const review = useAcademicsMutation(recordReview)
  const [revealed, setRevealed] = useState<string | null>(null)
  const shownAt = useRef(0)

  const queue = todaysQueue(cards, reviewsToday, newPerDay, now)
  const card = queue[0]
  const showingAnswer = card !== undefined && revealed === card.id

  // The time spent on a card is measured from when its front appears.
  useEffect(() => {
    shownAt.current = performance.now()
  }, [card?.id])

  function rate(grade: Grade) {
    if (!card || review.isPending) return
    review.mutate({ card, grade, durationMs: msSince(shownAt.current), scheduler }, { onSuccess: () => setRevealed(null) })
  }

  // Keyboard: Space or Enter shows the answer, 1–4 rates it. The listener always calls the
  // latest functions through this ref (updated after each render).
  const keys = useRef({ reveal: () => {}, rate: (_grade: Grade) => {} })
  useEffect(() => {
    keys.current = { reveal: () => card && setRevealed(card.id), rate }
  })
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        keys.current.reveal()
      } else if (event.key === '1' || event.key === '2' || event.key === '3' || event.key === '4') {
        keys.current.rate(Number(event.key) as Grade)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!card) return <AllDone cards={cards} now={now} />

  const fresh = queue.filter((item) => isNew(item)).length
  const intervals = showingAnswer ? previewIntervals(scheduler, card.fsrs, now) : null
  const occlusion = parseOcclusionFront(card.front)

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        {queue.length - fresh} to review · {fresh} new
      </p>
      <Card>
        <CardContent className="grid min-h-40 gap-4">
          {occlusion ? (
            <div className="grid gap-3">
              <p className="font-medium">{occlusionPrompt(occlusion)}</p>
              <ImageOcclusionView occlusion={occlusion} revealed={showingAnswer} />
            </div>
          ) : (
            <Markdown className="text-base">{card.front}</Markdown>
          )}
          {showingAnswer && (
            <>
              <hr />
              <Markdown className="text-base">{card.back}</Markdown>
            </>
          )}
        </CardContent>
      </Card>

      {showingAnswer && intervals ? (
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="How well did you know it?">
          {GRADES.map((grade) => (
            <Button
              key={grade}
              variant={grade === 1 ? 'outline' : grade === 3 ? 'default' : 'secondary'}
              className="h-auto flex-col gap-0.5 py-2"
              disabled={review.isPending}
              onClick={() => rate(grade)}
            >
              <span>{GRADE_LABEL[grade]}</span>
              <span className="text-xs opacity-75">{intervalLabel(intervals[grade])}</span>
            </Button>
          ))}
        </div>
      ) : (
        <Button size="lg" onClick={() => setRevealed(card.id)}>
          <Eye aria-hidden />
          Show answer
        </Button>
      )}
      {showingAnswer && isLapse(card, 1) && (
        <p className="text-xs text-muted-foreground">You had learned this card: Again also puts it in your mistake notebook.</p>
      )}
      {review.error && (
        <p role="alert" className="text-sm text-destructive">
          {review.error.message}
        </p>
      )}
      <p className="hidden text-xs text-muted-foreground sm:block">Keys: Space shows the answer, 1–4 rate it.</p>
    </div>
  )
}

/** Nothing left for now. (Everything still to come is due after today, or is new beyond today's limit.) */
function AllDone({ cards, now }: { cards: Flashcard[]; now: Date }) {
  const active = cards.filter((card) => !card.suspended)
  const waitingNew = active.filter((card) => isNew(card)).length
  const upcoming = active.filter((card) => !isNew(card)).map((card) => Date.parse(card.due_at))
  const next = upcoming.length > 0 ? Math.min(...upcoming) : null

  let message: string
  if (cards.length === 0) message = 'Add cards yourself, or select text in a PDF and tap Flashcards.'
  else if (waitingNew > 0) {
    message = `That was today's share of new cards. ${waitingNew} more come in the next days, so reviews never pile up.`
  } else if (next !== null) message = `The next card comes back in ${intervalLabel(next - now.getTime())}.`
  else message = 'All your cards are suspended.'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PartyPopper className="size-4" aria-hidden />
          {cards.length === 0 ? 'No flashcards yet' : 'All caught up'}
        </CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link to="/academics/cards">
            <Layers aria-hidden />
            {cards.length === 0 ? 'Add cards' : 'Manage cards'}
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
