import { useState } from 'react'
import { ExternalLink, LoaderCircle, Send, Trash2 } from 'lucide-react'
import { Markdown } from '@/components/Markdown'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { openInStudio } from '@/features/bridge/studio'
import { ACTION_LABEL, type Anchor } from './anchors'

/** A saved AI answer, with what it was about. */
export function AnchorDialog({
  anchor,
  cardCount,
  materialTitle,
  deleting,
  onDelete,
  onClose,
}: {
  anchor: Anchor | null
  cardCount: number
  /** The PDF's title, sent along to Ekagra Studio. */
  materialTitle: string | null
  deleting: boolean
  onDelete: (anchor: Anchor) => void
  onClose: () => void
}) {
  const [studioProblem, setStudioProblem] = useState<string | null>(null)
  const action = anchor && anchor.action in ACTION_LABEL ? ACTION_LABEL[anchor.action as keyof typeof ACTION_LABEL] : 'Answer'
  return (
    <Dialog open={anchor !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        {anchor && (
          <>
            <DialogHeader>
              <DialogTitle>
                {action} · page {anchor.page_no}
              </DialogTitle>
              <DialogDescription>
                {anchor.question ? `You asked: ${anchor.question}` : anchor.selected_text ? `“${anchor.selected_text.slice(0, 200)}”` : 'About this page'}
              </DialogDescription>
            </DialogHeader>
            <Markdown>{anchor.response_md ?? ''}</Markdown>
            {cardCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {cardCount === 1 ? '1 flashcard was' : `${cardCount} flashcards were`} added to your cards.
              </p>
            )}
            {studioProblem && (
              <p role="alert" className="text-sm text-destructive">
                {studioProblem}
              </p>
            )}
            <DialogFooter>
              <Button variant="ghost" className="text-destructive" disabled={deleting} onClick={() => onDelete(anchor)}>
                <Trash2 aria-hidden />
                Delete
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setStudioProblem(null)
                  openInStudio(anchor, materialTitle).catch(() => setStudioProblem("Ekagra Studio couldn't be opened. Check that it's running (docs/4)."))
                }}
              >
                <ExternalLink aria-hidden />
                Open in Ekagra Studio
              </Button>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** "Ask about this page": the tutor answers from the page (and the selected text, if any). */
export function AskDialog({
  open,
  page,
  selectedText,
  busy,
  error,
  onAsk,
  onClose,
}: {
  open: boolean
  page: number
  selectedText: string | null
  busy: boolean
  error: string | null
  onAsk: (question: string) => void
  onClose: () => void
}) {
  const [question, setQuestion] = useState('')
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (question.trim()) onAsk(question.trim())
          }}
        >
          <DialogHeader>
            <DialogTitle>Ask about page {page}</DialogTitle>
            <DialogDescription>
              {selectedText ? `About your selection: “${selectedText.slice(0, 120)}”` : 'The tutor answers from this page.'}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="Your question"
            rows={3}
            placeholder="e.g. Why is BCNF stricter than 3NF?"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={busy || !question.trim()}>
              {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Send aria-hidden />}
              Ask
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
