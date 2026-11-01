import { endOfDay } from 'date-fns'
import { Layers, NotebookPen } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { countLabel } from '@/features/academics/labels'
import { todaysQueue, useFlashcards, useReviewsToday } from '@/features/flashcards/flashcards'
import { dueMistakes } from '@/features/mistakes/ladder'
import { useMistakes } from '@/features/mistakes/mistakes'
import { useProfile } from '@/features/profile/queries'
import { readSettings } from '@/features/profile/settings'
import { useNow } from '@/hooks/useNow'

/** What's waiting: flashcards and mistakes to review today. */
export function DueSoon() {
  const now = useNow(60_000)
  const cards = useFlashcards()
  const reviews = useReviewsToday(now)
  const mistakes = useMistakes()
  const profile = useProfile()
  const newPerDay = readSettings(profile.data?.settings).learning.newCardsPerDay

  const cardsDue = cards.data && reviews.data ? todaysQueue(cards.data, reviews.data, newPerDay, now).length : 0
  const mistakesDue = mistakes.data ? dueMistakes(mistakes.data, endOfDay(now)).length : 0
  if (cardsDue === 0 && mistakesDue === 0) return null

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Due soon</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        <p className="text-sm">
          Reviews waiting: {[cardsDue > 0 ? countLabel(cardsDue, 'flashcard') : null, mistakesDue > 0 ? countLabel(mistakesDue, 'mistake') : null].filter(Boolean).join(' · ')}
        </p>
        <div className="flex flex-wrap gap-2">
          {cardsDue > 0 && (
            <Button asChild size="sm" variant="outline">
              <Link to="/academics/review">
                <Layers aria-hidden />
                Review cards
              </Link>
            </Button>
          )}
          {mistakesDue > 0 && (
            <Button asChild size="sm" variant="outline">
              <Link to="/academics/mistakes">
                <NotebookPen aria-hidden />
                Mistakes
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
