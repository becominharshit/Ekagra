import { useEffect, useState, type ChangeEvent } from 'react'
import { Check, Copy, ImagePlus, LoaderCircle, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useAuthStore } from '@/features/auth/authStore'
import { copyText } from '@/lib/clipboard'
import { deviceContext, useSendFeedback } from './feedback'
import { useFeedbackStore } from './feedbackStore'
import {
  FEEDBACK_KINDS,
  feedbackText,
  KIND_LABEL,
  MAX_MESSAGE_LENGTH,
  messageProblem,
  screenName,
  screenshotProblem,
  toKind,
  type Feedback,
  type FeedbackKind,
} from './report'

const PLACEHOLDER: Record<FeedbackKind, string> = {
  bug: 'What happened, and what did you expect? E.g. "The timer stopped when I locked my phone."',
  idea: 'What would make Ekagra better for you?',
  other: 'Anything you want to tell the founder.',
}

/** The "Send feedback" sheet, opened from the top bar on any screen or from Me. */
export function FeedbackSheet() {
  const open = useFeedbackStore((state) => state.open)
  const path = useFeedbackStore((state) => state.path)
  const close = useFeedbackStore((state) => state.close)
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        {/* The form only exists while the sheet is open, so it starts empty every time. */}
        {open && <FeedbackForm path={path} onDone={close} />}
      </DialogContent>
    </Dialog>
  )
}

function FeedbackForm({ path, onDone }: { path: string; onDone: () => void }) {
  const isDemo = useAuthStore((state) => state.status === 'demo')
  const send = useSendFeedback()
  const [kind, setKind] = useState<FeedbackKind>('bug')
  const [message, setMessage] = useState('')
  const [screen, setScreen] = useState(() => screenName(path))
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [sent, setSent] = useState<Feedback | null>(null)

  // The preview's temporary address is freed when the image changes or the sheet closes.
  useEffect(() => () => {
    if (shot) URL.revokeObjectURL(shot.url)
  }, [shot])

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const issue = screenshotProblem(file)
    setProblem(issue)
    if (!issue) setShot({ file, url: URL.createObjectURL(file) })
  }

  function submit() {
    const issue = messageProblem(message)
    setProblem(issue)
    if (issue) return
    send.mutate({ kind, message, screen, path, screenshot: shot?.file ?? null, context: deviceContext() }, { onSuccess: setSent })
  }

  if (sent) return <SentView feedback={sent} isDemo={isDemo} onDone={onDone} />

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Send feedback</DialogTitle>
        <DialogDescription>Found a bug, or have an idea? It goes to the founder, who reads every message.</DialogDescription>
      </DialogHeader>
      <ToggleGroup
        type="single"
        variant="outline"
        value={kind}
        onValueChange={(value) => value && setKind(toKind(value))}
        aria-label="Kind of feedback"
      >
        {FEEDBACK_KINDS.map((option) => (
          <ToggleGroupItem key={option} value={option}>
            {KIND_LABEL[option]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Textarea
        aria-label="Your message"
        rows={5}
        maxLength={MAX_MESSAGE_LENGTH}
        placeholder={PLACEHOLDER[kind]}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
      />
      <div className="grid gap-1.5">
        <Label htmlFor="feedback-screen">Screen</Label>
        <Input id="feedback-screen" maxLength={100} value={screen} onChange={(event) => setScreen(event.target.value)} />
      </div>
      <div className="grid gap-2">
        {shot ? (
          <div className="relative w-fit">
            <img src={shot.url} alt="Your screenshot" className="max-h-48 rounded-md border object-contain" />
            <Button size="icon-xs" variant="secondary" className="absolute top-1 right-1" aria-label="Remove the screenshot" onClick={() => setShot(null)}>
              <X aria-hidden />
            </Button>
          </div>
        ) : (
          <label className="flex items-center gap-2 text-sm">
            <ImagePlus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <Input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Screenshot (optional)" onChange={pick} />
          </label>
        )}
        <p className="text-xs text-muted-foreground">
          Optional. Take a screenshot first (on most Android phones: Power + Volume down), then add it here.
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        {isDemo
          ? "Demo Mode has no server, so this is saved on this device only. Afterwards you can copy it and send it to the founder, or sign in to send it."
          : 'Sent with it: the screen name, the app build, and your device type and screen size.'}
      </p>
      {(problem ?? send.error) && (
        <p role="alert" className="text-sm text-destructive">
          {problem ?? send.error?.message}
        </p>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={send.isPending} onClick={submit}>
          {send.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Send aria-hidden />}
          {isDemo ? 'Save on this device' : 'Send'}
        </Button>
      </DialogFooter>
    </div>
  )
}

function SentView({ feedback, isDemo, onDone }: { feedback: Feedback; isDemo: boolean; onDone: () => void }) {
  const [copied, setCopied] = useState<boolean | null>(null)

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{isDemo ? 'Saved on this device' : 'Thank you!'}</DialogTitle>
        <DialogDescription>
          {isDemo
            ? "Demo Mode can't send it to the founder. Copy it and send it on WhatsApp or by email (add the screenshot yourself), or sign in and send it again."
            : 'The founder will read it. You can see what happens to it under Me → Feedback.'}
        </DialogDescription>
      </DialogHeader>
      {copied === false && (
        <p role="alert" className="text-sm text-destructive">
          This device didn't allow copying. Sign in to send feedback instead.
        </p>
      )}
      <DialogFooter>
        {isDemo && (
          <Button variant="outline" onClick={() => void copyText(feedbackText(feedback)).then(setCopied)}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? 'Copied' : 'Copy text'}
          </Button>
        )}
        <Button onClick={onDone}>Done</Button>
      </DialogFooter>
    </div>
  )
}
