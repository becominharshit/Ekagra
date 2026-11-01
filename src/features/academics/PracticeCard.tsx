import { endOfDay } from 'date-fns'
import { Layers, NotebookPen, Play } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { todaysQueue, useFlashcards, useReviewsToday } from '@/features/flashcards/flashcards'
import { dueMistakes } from '@/features/mistakes/ladder'
import { useMistakes } from '@/features/mistakes/mistakes'
import { useProfile } from '@/features/profile/queries'
import { readSettings } from '@/features/profile/settings'
import { countLabel } from './labels'

/** What's waiting today: flashcards to review and mistakes coming back, with links to both. */
export function PracticeCard({ now }: { now: Date }) {
  const cards = useFlashcards()
  const reviews = useReviewsToday(now)
  const mistakes = useMistakes()
  const profile = useProfile()
  const newPerDay = readSettings(profile.data?.settings).learning.newCardsPerDay

  const totalCards = cards.data?.length ?? 0
  const cardsDue = cards.data && reviews.data ? todaysQueue(cards.data, reviews.data, newPerDay, now).length : 0
  const open = mistakes.data?.filter((mistake) => mistake.status === 'open').length ?? 0
  const mistakesDue = mistakes.data ? dueMistakes(mistakes.data, endOfDay(now)).length : 0

  let cardSummary = 'No cards yet. Make them from a PDF in your library, or add your own.'
  if (totalCards > 0) cardSummary = `${cardsDue > 0 ? `${cardsDue} to review now` : 'Nothing to review right now'} · ${countLabel(totalCards, 'card')}`
  let mistakeSummary = 'Empty. Forgotten cards and wrong answers land here.'
  if (open > 0) mistakeSummary = `${mistakesDue > 0 ? `${mistakesDue} to review today` : 'Nothing due today'} · ${open} open`

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Practice</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <div>
            <p className="flex items-center gap-2 font-medium">
              <Layers className="size-4" aria-hidden />
              Flashcards
            </p>
            <p className="text-sm text-muted-foreground">{cardSummary}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant={cardsDue > 0 ? 'default' : 'outline'}>
              <Link to="/academics/review">
                <Play aria-hidden />
                Review{cardsDue > 0 ? ` (${cardsDue})` : ''}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/academics/cards">All cards</Link>
            </Button>
          </div>
        </div>
        <div className="grid gap-2">
          <div>
            <p className="flex items-center gap-2 font-medium">
              <NotebookPen className="size-4" aria-hidden />
              Mistake notebook
            </p>
            <p className="text-sm text-muted-foreground">{mistakeSummary}</p>
          </div>
          <Button asChild size="sm" variant={mistakesDue > 0 ? 'default' : 'outline'} className="justify-self-start">
            <Link to="/academics/mistakes">Mistakes{mistakesDue > 0 ? ` (${mistakesDue})` : ''}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
