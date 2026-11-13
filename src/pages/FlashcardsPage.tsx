import { useState } from 'react'
import { ArrowLeft, Pause, Pencil, Play, Plus, Search, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { countLabel } from '@/features/academics/labels'
import { useStudy } from '@/features/academics/roadmap'
import { useAcademicsMutation } from '@/features/academics/subjects'
import { FlashcardDialog } from '@/features/flashcards/FlashcardDialog'
import { ImageOcclusionView } from '@/features/flashcards/ImageOcclusionView'
import { deleteCard, todaysQueue, updateCard, useFlashcards, useReviewsToday } from '@/features/flashcards/flashcards'
import { dueLabel, type Flashcard } from '@/features/flashcards/fsrs'
import { occlusionPrompt, occlusionSummaryLabel, parseOcclusionFront } from '@/features/flashcards/occlusion'
import { useProfile } from '@/features/profile/queries'
import { readSettings } from '@/features/profile/settings'
import { useNow } from '@/hooks/useNow'

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Added by you',
  anchor: 'From a PDF',
  generated: 'From a lesson',
  mistake: 'From a mistake',
}

/** Long lists only show this many cards; searching narrows them down. */
const SHOWN_AT_ONCE = 100

/** All flashcards: search, add, edit, suspend and delete. */
export function FlashcardsPage() {
  const now = useNow(60_000)
  const cards = useFlashcards()
  const reviews = useReviewsToday(now)
  const profile = useProfile()
  const study = useStudy()
  const settings = readSettings(profile.data?.settings)
  const update = useAcademicsMutation(updateCard)
  const remove = useAcademicsMutation(deleteCard)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Flashcard | null>(null)
  const [deleting, setDeleting] = useState<Flashcard | null>(null)

  const due = cards.data && reviews.data ? todaysQueue(cards.data, reviews.data, settings.learning.newCardsPerDay, now).length : 0
  const topicTitle = new Map((study.data?.topics ?? []).map((topic) => [topic.id, topic.title]))
  const words = search.trim().toLowerCase()
  const matching = (cards.data ?? []).filter((card) => !words || `${occlusionSummaryLabel(card.front)}\n${card.back}`.toLowerCase().includes(words))

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link to="/academics">
          <ArrowLeft aria-hidden />
          Academics
        </Link>
      </Button>
      <PageHeader title="Flashcards" subtitle="Each card comes back just before you would forget it." />

      <div className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant={due > 0 ? 'default' : 'outline'}>
            <Link to="/academics/review">
              <Play aria-hidden />
              Review{due > 0 ? ` (${due})` : ''}
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            Add card
          </Button>
        </div>

        {cards.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
        {(cards.error || update.error || remove.error) && (
          <p role="alert" className="text-sm text-destructive">
            {(cards.error ?? update.error ?? remove.error)?.message}
          </p>
        )}

        {cards.data?.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>No flashcards yet</CardTitle>
              <CardDescription>
                Add your own, or open a PDF in your library, select some text and tap Flashcards.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {cards.data && cards.data.length > 0 && (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                aria-label="Search cards"
                placeholder="Search cards"
                className="pl-8"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {words ? `${countLabel(matching.length, 'card')} found` : countLabel(cards.data.length, 'card')}
              {matching.length > SHOWN_AT_ONCE && `, showing the first ${SHOWN_AT_ONCE}`}. Suspended cards don't come up for review.
            </p>
          </>
        )}

        {matching.slice(0, SHOWN_AT_ONCE).map((card) => {
          const status = dueLabel(card, now)
          const topic = card.topic_id ? topicTitle.get(card.topic_id) : undefined
          const occlusion = parseOcclusionFront(card.front)
          return (
            <Card key={card.id} size="sm" className={card.suspended ? 'opacity-60' : undefined}>
              <CardContent className="grid gap-2">
                {occlusion ? (
                  <div className="grid gap-2">
                    <p className="font-medium">{occlusionPrompt(occlusion)}</p>
                    <ImageOcclusionView occlusion={occlusion} revealed={false} compact />
                  </div>
                ) : (
                  <p className="line-clamp-3 font-medium whitespace-pre-wrap">{card.front}</p>
                )}
                <p className="line-clamp-3 text-sm whitespace-pre-wrap text-muted-foreground">{card.back}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <Badge variant={status === 'Due now' ? 'default' : 'secondary'}>{status}</Badge>
                  {occlusion && <Badge variant="outline">Image occlusion</Badge>}
                  <span>{SOURCE_LABEL[card.source] ?? card.source}</span>
                  {topic && <span>· {topic}</span>}
                </div>
                <div className="-ml-2 flex flex-wrap gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(card)}>
                    <Pencil aria-hidden />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={update.isPending}
                    onClick={() => update.mutate({ id: card.id, patch: { suspended: !card.suspended } })}
                  >
                    {card.suspended ? <Play aria-hidden /> : <Pause aria-hidden />}
                    {card.suspended ? 'Resume' : 'Suspend'}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleting(card)}>
                    <Trash2 aria-hidden />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <FlashcardDialog
        open={adding || editing !== null}
        card={editing}
        onOpenChange={(open) => {
          if (open) return
          setAdding(false)
          setEditing(null)
        }}
      />
      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this card?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting ? occlusionSummaryLabel(deleting.front).slice(0, 120) : ''}” and its review history are deleted. To stop seeing it without losing it, suspend it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) remove.mutate(deleting.id)
                setDeleting(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
