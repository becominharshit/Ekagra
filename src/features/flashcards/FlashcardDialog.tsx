import { useState, type FormEvent } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useTopicChoices } from '@/features/academics/roadmap'
import { useAcademicsMutation } from '@/features/academics/subjects'
import { addCards, updateCard } from './flashcards'
import type { Flashcard } from './fsrs'

const NO_TOPIC = 'none'

interface FlashcardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The card to edit. Without it, new cards are added. */
  card?: Flashcard | null
}

/** Add flashcards (one after another), or change one. */
export function FlashcardDialog({ open, onOpenChange, card }: FlashcardDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* The form only exists while the dialog is open, so it starts fresh every time. */}
        <CardForm card={card ?? null} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function CardForm({ card, onDone }: { card: Flashcard | null; onDone: () => void }) {
  const topics = useTopicChoices()
  const [front, setFront] = useState(card?.front ?? '')
  const [back, setBack] = useState(card?.back ?? '')
  const [topicId, setTopicId] = useState(card?.topic_id ?? NO_TOPIC)
  const [problem, setProblem] = useState<string | null>(null)
  const [added, setAdded] = useState(0)
  const save = useAcademicsMutation<void, void>(async (source) => {
    const values = { front: front.trim(), back: back.trim(), topic_id: topicId === NO_TOPIC ? null : topicId }
    if (card) await updateCard(source, { id: card.id, patch: values })
    else await addCards(source, [{ ...values, source: 'manual' }])
  })

  /** `next`: keep the dialog open for another card (same topic). */
  function submit(next: boolean) {
    if (!front.trim() || !back.trim()) {
      setProblem('Write both sides of the card.')
      return
    }
    setProblem(null)
    save.mutate(undefined, {
      onSuccess: () => {
        if (!next) return onDone()
        setFront('')
        setBack('')
        setAdded((count) => count + 1)
      },
    })
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event: FormEvent) => {
        event.preventDefault()
        submit(false)
      }}
    >
      <DialogHeader>
        <DialogTitle>{card ? 'Edit card' : 'Add a card'}</DialogTitle>
        <DialogDescription>
          {added > 0
            ? `${added === 1 ? '1 card' : `${added} cards`} added. Write the next one.`
            : 'Front: a short question. Back: the answer you want to remember.'}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="card-front">Front</Label>
        <Textarea id="card-front" rows={3} maxLength={2000} placeholder="e.g. When is a relation in BCNF?" value={front} onChange={(e) => setFront(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="card-back">Back</Label>
        <Textarea id="card-back" rows={3} maxLength={4000} placeholder="e.g. When every determinant is a superkey." value={back} onChange={(e) => setBack(e.target.value)} />
      </div>
      {topics.length > 0 && (
        <div className="grid gap-2">
          <Label htmlFor="card-topic">Topic (optional)</Label>
          <Select value={topicId} onValueChange={setTopicId}>
            <SelectTrigger id="card-topic" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_TOPIC}>No topic</SelectItem>
              {topics.map((topic) => (
                <SelectItem key={topic.id} value={topic.id}>
                  {topic.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {(problem || save.error) && (
        <p role="alert" className="text-sm text-destructive">
          {problem ?? save.error?.message}
        </p>
      )}
      <DialogFooter>
        {!card && (
          <Button type="button" variant="outline" disabled={save.isPending} onClick={() => submit(true)}>
            Add and write another
          </Button>
        )}
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
          {card ? 'Save' : 'Add card'}
        </Button>
      </DialogFooter>
    </form>
  )
}
