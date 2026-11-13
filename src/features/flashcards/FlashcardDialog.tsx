import { useState, type FormEvent } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useTopicChoices } from '@/features/academics/roadmap'
import { useAcademicsMutation } from '@/features/academics/subjects'
import { ImageOcclusionEditor, type ImageOcclusionDraft } from './ImageOcclusionEditor'
import { ImageOcclusionView } from './ImageOcclusionView'
import { addCards, updateCard } from './flashcards'
import type { Flashcard } from './fsrs'
import { buildOcclusionCards, encodeOcclusionFront, parseOcclusionFront } from './occlusion'

const NO_TOPIC = 'none'
const EMPTY_OCCLUSION: ImageOcclusionDraft = {
  prompt: '',
  imageUrl: '',
  masks: [],
}

interface FlashcardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The card to edit. Without it, new cards are added. */
  card?: Flashcard | null
}

/** Add flashcards (text or Image Occlusion), or change one. */
export function FlashcardDialog({ open, onOpenChange, card }: FlashcardDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {/* The form only exists while the dialog is open, so it starts fresh every time. */}
        <CardForm card={card ?? null} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function CardForm({ card, onDone }: { card: Flashcard | null; onDone: () => void }) {
  const existingOcc = card ? parseOcclusionFront(card.front) : null
  const topics = useTopicChoices()
  const [mode, setMode] = useState<'text' | 'occlusion'>('text')
  const [front, setFront] = useState(existingOcc ? existingOcc.prompt : (card?.front ?? ''))
  const [back, setBack] = useState(card?.back ?? '')
  const [occDraft, setOccDraft] = useState<ImageOcclusionDraft>(EMPTY_OCCLUSION)
  const [topicId, setTopicId] = useState(card?.topic_id ?? NO_TOPIC)
  const [problem, setProblem] = useState<string | null>(null)
  const [added, setAdded] = useState(0)

  const save = useAcademicsMutation<void, number>(async (source) => {
    const resolvedTopic = topicId === NO_TOPIC ? null : topicId
    if (card) {
      if (existingOcc) {
        const nextMasks = existingOcc.masks.map((mask, index) =>
          index === existingOcc.activeMaskIndex ? { ...mask, label: back.trim() } : mask,
        )
        const nextFront = encodeOcclusionFront({
          ...existingOcc,
          prompt: front.trim(),
          masks: nextMasks,
        })
        await updateCard(source, { id: card.id, patch: { front: nextFront, back: back.trim(), topic_id: resolvedTopic } })
        return 1
      }
      await updateCard(source, { id: card.id, patch: { front: front.trim(), back: back.trim(), topic_id: resolvedTopic } })
      return 1
    }
    if (mode === 'occlusion') {
      const generated = buildOcclusionCards({
        prompt: occDraft.prompt,
        imageUrl: occDraft.imageUrl,
        masks: occDraft.masks,
        topicId: resolvedTopic,
      })
      await addCards(source, generated)
      return generated.length
    }
    await addCards(source, [{ front: front.trim(), back: back.trim(), topic_id: resolvedTopic, source: 'manual' }])
    return 1
  })

  /** `next`: keep the dialog open for another card (same topic). */
  function submit(next: boolean) {
    if (!card && mode === 'occlusion') {
      if (!occDraft.prompt.trim() || !occDraft.imageUrl || occDraft.masks.length === 0) {
        setProblem('Pick or upload a diagram, write a prompt, and add at least one mask box.')
        return
      }
      if (occDraft.masks.some((mask) => !mask.label.trim())) {
        setProblem('Write an answer label for every occlusion box.')
        return
      }
    } else if (!front.trim() || !back.trim()) {
      setProblem('Write both sides of the card.')
      return
    }
    setProblem(null)
    save.mutate(undefined, {
      onSuccess: (count) => {
        if (!next) return onDone()
        setFront('')
        setBack('')
        setOccDraft(EMPTY_OCCLUSION)
        setAdded((prev) => prev + count)
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
            : 'Create standard text cards or Image Occlusion cards for diagrams.'}
        </DialogDescription>
      </DialogHeader>

      {!card && (
        <ToggleGroup
          type="single"
          variant="outline"
          value={mode}
          onValueChange={(nextMode) => {
            if (nextMode === 'text' || nextMode === 'occlusion') {
              setMode(nextMode)
              setProblem(null)
            }
          }}
        >
          <ToggleGroupItem value="text">Text card</ToggleGroupItem>
          <ToggleGroupItem value="occlusion">Image occlusion</ToggleGroupItem>
        </ToggleGroup>
      )}

      {!card && mode === 'occlusion' ? (
        <ImageOcclusionEditor value={occDraft} onChange={setOccDraft} />
      ) : (
        <>
          {existingOcc && <ImageOcclusionView occlusion={existingOcc} revealed compact />}
          <div className="grid gap-2">
            <Label htmlFor="card-front">{existingOcc ? 'Prompt' : 'Front'}</Label>
            {existingOcc ? (
              <Input
                id="card-front"
                maxLength={240}
                value={front}
                onChange={(e) => setFront(e.target.value)}
              />
            ) : (
              <Textarea id="card-front" rows={3} maxLength={2000} placeholder="e.g. When is a relation in BCNF?" value={front} onChange={(e) => setFront(e.target.value)} />
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="card-back">{existingOcc ? `Hidden answer (Box #${existingOcc.activeMaskIndex + 1})` : 'Back'}</Label>
            <Textarea id="card-back" rows={3} maxLength={4000} placeholder="e.g. When every determinant is a superkey." value={back} onChange={(e) => setBack(e.target.value)} />
          </div>
        </>
      )}
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
