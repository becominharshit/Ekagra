import { useState } from 'react'
import { endOfDay } from 'date-fns'
import { ArrowLeft, Check, Eye, Layers, PartyPopper, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { Link } from 'react-router'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useStudy } from '@/features/academics/roadmap'
import { useAcademicsMutation } from '@/features/academics/subjects'
import { useFlashcards } from '@/features/flashcards/flashcards'
import { intervalLabel, type Flashcard } from '@/features/flashcards/fsrs'
import { dueMistakes, mistakeLabel, RIGHT_ANSWERS_TO_FIX, type Mistake } from '@/features/mistakes/ladder'
import { MistakeDialog } from '@/features/mistakes/MistakeDialog'
import { deleteMistake, makeCardFromMistake, recordMistakeReview, reopen, useMistakes } from '@/features/mistakes/mistakes'
import { useNow } from '@/hooks/useNow'

/** Where a mistake came from, in words. */
function origin(mistake: Mistake, cardById: Map<string, Flashcard>): string {
  if (mistake.question_id) return 'From a quiz'
  if (mistake.flashcard_id) return cardById.get(mistake.flashcard_id)?.source === 'mistake' ? 'Has a flashcard' : 'From a forgotten card'
  return 'Added by you'
}

/** The mistake notebook: today's reviews first, then every mistake (open or fixed). */
export function MistakesPage() {
  const now = useNow(60_000)
  const mistakes = useMistakes()
  const cards = useFlashcards()
  const study = useStudy()
  const remove = useAcademicsMutation(deleteMistake)
  const reopenIt = useAcademicsMutation(reopen)
  const makeCard = useAcademicsMutation(makeCardFromMistake)
  const [tab, setTab] = useState<'open' | 'fixed'>('open')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Mistake | null>(null)
  const [deleting, setDeleting] = useState<Mistake | null>(null)

  const endOfToday = endOfDay(now)
  const all = mistakes.data ?? []
  const due = dueMistakes(all, endOfToday)
  const open = all.filter((mistake) => mistake.status === 'open')
  const fixedCount = all.length - open.length
  const cardById = new Map((cards.data ?? []).map((card) => [card.id, card]))
  const topicTitle = new Map((study.data?.topics ?? []).map((topic) => [topic.id, topic.title]))
  const nextReview = open.length > 0 ? Math.min(...open.map((mistake) => Date.parse(mistake.next_review_at))) : null
  const actionError = remove.error ?? reopenIt.error ?? makeCard.error

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link to="/academics">
          <ArrowLeft aria-hidden />
          Academics
        </Link>
      </Button>
      <PageHeader title="Mistake notebook" subtitle="Mistakes come back after 1, 3 and 7 days. Two right answers on different days fix them." />

      <div className="grid gap-4">
        <Button variant="outline" className="justify-self-start" onClick={() => setAdding(true)}>
          <Plus aria-hidden />
          Add a mistake
        </Button>

        {mistakes.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
        {mistakes.error && (
          <p role="alert" className="text-sm text-destructive">
            {mistakes.error.message}
          </p>
        )}

        {due[0] ? (
          <MistakeReview key={due[0].id} mistake={due[0]} left={due.length} />
        ) : (
          mistakes.data && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PartyPopper className="size-4" aria-hidden />
                  {all.length === 0 ? 'No mistakes yet' : 'Nothing to review today'}
                </CardTitle>
                <CardDescription>
                  {all.length === 0
                    ? 'Forgotten flashcards and wrong quiz answers land here by themselves. You can add your own too.'
                    : nextReview !== null
                      ? `The next one comes back in ${intervalLabel(nextReview - now.getTime())}.`
                      : 'Every mistake is fixed. Well done.'}
                </CardDescription>
              </CardHeader>
            </Card>
          )
        )}

        {all.length > 0 && (
          <Tabs value={tab} onValueChange={(next) => setTab(next === 'fixed' ? 'fixed' : 'open')}>
            <TabsList>
              <TabsTrigger value="open">Open ({open.length})</TabsTrigger>
              <TabsTrigger value="fixed">Fixed ({fixedCount})</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        {actionError && (
          <p role="alert" className="text-sm text-destructive">
            {actionError.message}
          </p>
        )}

        {all
          .filter((mistake) => mistake.status === tab)
          .map((mistake) => {
            const label = mistakeLabel(mistake, now, endOfToday)
            const topic = mistake.topic_id ? topicTitle.get(mistake.topic_id) : undefined
            return (
              <Card key={mistake.id} size="sm">
                <CardContent className="grid gap-2">
                  <p className="line-clamp-3 font-medium whitespace-pre-wrap">{mistake.concept}</p>
                  {mistake.why_wrong && <p className="line-clamp-2 text-sm text-muted-foreground">Why: {mistake.why_wrong}</p>}
                  {mistake.correct_approach && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">Correct: {mistake.correct_approach}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <Badge variant={label === 'Due now' ? 'default' : 'secondary'}>{label}</Badge>
                    <span>
                      {[
                        mistake.status === 'open' ? `${mistake.correct_count} of ${RIGHT_ANSWERS_TO_FIX} right` : null,
                        origin(mistake, cardById),
                        topic,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                  <div className="-ml-2 flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(mistake)}>
                      <Pencil aria-hidden />
                      Edit
                    </Button>
                    {!mistake.flashcard_id && (
                      <Button size="sm" variant="ghost" disabled={makeCard.isPending} onClick={() => makeCard.mutate(mistake)}>
                        <Layers aria-hidden />
                        Make a flashcard
                      </Button>
                    )}
                    {mistake.status === 'fixed' && (
                      <Button size="sm" variant="ghost" disabled={reopenIt.isPending} onClick={() => reopenIt.mutate(mistake)}>
                        <RotateCcw aria-hidden />
                        Reopen
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleting(mistake)}>
                      <Trash2 aria-hidden />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
      </div>

      <MistakeDialog
        open={adding || editing !== null}
        mistake={editing}
        onOpenChange={(isOpen) => {
          if (isOpen) return
          setAdding(false)
          setEditing(null)
        }}
      />
      <AlertDialog open={deleting !== null} onOpenChange={(isOpen) => !isOpen && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this mistake?</AlertDialogTitle>
            <AlertDialogDescription>“{deleting?.concept.slice(0, 120)}” is deleted from the notebook. A flashcard made from it stays.</AlertDialogDescription>
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

/** One due mistake: recall the correct approach, check it, then say how it went. */
function MistakeReview({ mistake, left }: { mistake: Mistake; left: number }) {
  const review = useAcademicsMutation(recordMistakeReview)
  const [revealed, setRevealed] = useState(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review · {left} left today</CardTitle>
        <CardDescription>First explain the correct approach to yourself, then check it.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="font-medium whitespace-pre-wrap">{mistake.concept}</p>
        {revealed && (
          <div className="grid gap-2 rounded-lg bg-muted/40 p-3 text-sm">
            {mistake.why_wrong && (
              <p>
                <span className="font-medium">Why it went wrong: </span>
                {mistake.why_wrong}
              </p>
            )}
            {mistake.correct_approach ? (
              <div>
                <p className="font-medium">The correct approach</p>
                <Markdown>{mistake.correct_approach}</Markdown>
              </div>
            ) : (
              <p className="text-muted-foreground">No correct approach written yet. Add it with Edit below.</p>
            )}
          </div>
        )}
        {revealed ? (
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="How did it go?">
            <Button variant="outline" disabled={review.isPending} onClick={() => review.mutate({ mistake, right: false })}>
              <X aria-hidden />
              Still wrong
            </Button>
            <Button disabled={review.isPending} onClick={() => review.mutate({ mistake, right: true })}>
              <Check aria-hidden />
              Got it right
            </Button>
          </div>
        ) : (
          <Button onClick={() => setRevealed(true)}>
            <Eye aria-hidden />
            Show the correct approach
          </Button>
        )}
        {review.error && (
          <p role="alert" className="text-sm text-destructive">
            {review.error.message}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
