import { Layers, Play } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { countLabel } from '@/features/academics/labels'
import { useProfile } from '@/features/profile/queries'
import { readSettings } from '@/features/profile/settings'
import { todaysQueue, useFlashcards, useReviewsToday } from './flashcards'

/** How many flashcards are waiting today, with links to review them and to see all cards. */
export function FlashcardsCard({ now }: { now: Date }) {
  const cards = useFlashcards()
  const reviews = useReviewsToday(now)
  const profile = useProfile()
  const newPerDay = readSettings(profile.data?.settings).learning.newCardsPerDay

  const total = cards.data?.length ?? 0
  const due = cards.data && reviews.data ? todaysQueue(cards.data, reviews.data, newPerDay, now).length : 0
  let summary = 'No cards yet. Make them from a PDF in your library, or add your own.'
  if (total > 0) summary = due > 0 ? `${due} to review now · ${countLabel(total, 'card')}` : `Nothing to review right now · ${countLabel(total, 'card')}`

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="size-4" aria-hidden />
          Flashcards
        </CardTitle>
        <CardDescription>{summary}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant={due > 0 ? 'default' : 'outline'}>
          <Link to="/academics/review">
            <Play aria-hidden />
            Review{due > 0 ? ` (${due})` : ''}
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/academics/cards">All cards</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
