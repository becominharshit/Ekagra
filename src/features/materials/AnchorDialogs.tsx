import { useState } from 'react'
import { ExternalLink, LoaderCircle, Send, Trash2 } from 'lucide-react'
import type { AnchorAction, SourceCitation } from '@shared/schemas.ts'
import { CitationChips } from '@/components/CitationChips'
import { Markdown } from '@/components/Markdown'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { openInStudio } from '@/features/bridge/studio'
import { extractCitations } from '@/features/notes/citations'
import { ACTION_LABEL, type Anchor } from './anchors'

export interface StreamingAnchorPreview {
  action: AnchorAction
  pageNumber: number
  selectedText: string | null
  question: string | null
  answerMd: string
  citations: SourceCitation[]
}

/** A saved AI answer (or live streaming answer), with source citations and what it was about. */
export function AnchorDialog({
  anchor,
  streaming = null,
  cardCount,
  materialTitle,
  deleting,
  onJumpToPage,
  onDelete,
  onClose,
}: {
  anchor: Anchor | null
  streaming?: StreamingAnchorPreview | null
  cardCount: number
  /** The PDF's title, sent along to Ekagra Studio. */
  materialTitle: string | null
  deleting: boolean
  onJumpToPage?: (pageNumber: number) => void
  onDelete: (anchor: Anchor) => void
  onClose: () => void
}) {
  const [studioProblem, setStudioProblem] = useState<string | null>(null)
  const open = anchor !== null || streaming !== null
  const activeAction = anchor ? anchor.action : streaming?.action
  const action = activeAction && activeAction in ACTION_LABEL ? ACTION_LABEL[activeAction as keyof typeof ACTION_LABEL] : 'Answer'
  const pageNo = anchor ? anchor.page_no : (streaming?.pageNumber ?? 1)
  const question = anchor ? anchor.question : (streaming?.question ?? null)
  const selectedText = anchor ? anchor.selected_text : (streaming?.selectedText ?? null)
  const markdown = anchor ? (anchor.response_md ?? '') : (streaming?.answerMd ?? '')
  const citations = extractCitations(markdown, streaming?.citations ?? [])

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        {open && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span>
                  {action} · page {pageNo}
                </span>
                {streaming && !anchor && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    <LoaderCircle className="size-3 animate-spin" aria-hidden />
                    Streaming
                  </span>
                )}
              </DialogTitle>
              <DialogDescription>
                {question ? `You asked: ${question}` : selectedText ? `“${selectedText.slice(0, 200)}”` : 'About this page'}
              </DialogDescription>
            </DialogHeader>
            {markdown ? (
              <Markdown onCitePage={onJumpToPage}>{markdown}</Markdown>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
                Reading this page…
              </p>
            )}
            <CitationChips citations={citations} onCitePage={onJumpToPage} />
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
              {anchor && (
                <>
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
                </>
              )}
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
