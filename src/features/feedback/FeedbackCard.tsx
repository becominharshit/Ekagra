import { useState } from 'react'
import { format } from 'date-fns'
import { Check, Copy, MessageSquareWarning, Paperclip } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/features/auth/authStore'
import { copyText } from '@/lib/clipboard'
import { useFeedback } from './feedback'
import { useFeedbackStore } from './feedbackStore'
import { feedbackText, KIND_LABEL, statusLabel, toKind, type Feedback } from './report'

/** Shown on Me: a button for the feedback sheet, and the student's recent feedback with its status. */
export function FeedbackCard() {
  const show = useFeedbackStore((state) => state.show)
  const isDemo = useAuthStore((state) => state.status === 'demo')
  const feedback = useFeedback()
  const recent = (feedback.data ?? []).slice(0, 5)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Feedback</CardTitle>
        <CardDescription>
          Found a bug, or have an idea? Tell the founder. You can also tap{' '}
          <MessageSquareWarning role="img" aria-label="the Send feedback button" className="inline size-3.5 align-[-2px]" /> at the top of any screen: it
          notes which screen you were on.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Button variant="outline" onClick={() => show('/me')}>
          <MessageSquareWarning aria-hidden />
          Send feedback
        </Button>
        {feedback.error && (
          <p role="alert" className="text-sm text-destructive">
            {feedback.error.message}
          </p>
        )}
        {recent.length > 0 && (
          <div className="grid gap-2">
            <h3 className="text-sm font-medium">Your feedback</h3>
            <ul className="grid gap-2">
              {recent.map((item) => (
                <FeedbackItem key={item.id} item={item} isDemo={isDemo} />
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs text-muted-foreground">App build {__APP_BUILD__} (UTC)</p>
      </CardContent>
    </Card>
  )
}

function FeedbackItem({ item, isDemo }: { item: Feedback; isDemo: boolean }) {
  const [copied, setCopied] = useState<boolean | null>(null)

  return (
    <li className="grid gap-1.5 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">{KIND_LABEL[toKind(item.kind)]}</Badge>
        <span className="min-w-0 flex-1 truncate">
          {item.screen ?? 'No screen'} · {format(new Date(item.created_at), 'd MMM, h:mm a')}
        </span>
        <Badge variant={item.status === 'fixed' ? 'default' : 'outline'}>{isDemo ? 'On this device' : statusLabel(item.status)}</Badge>
      </div>
      <p className="line-clamp-3 text-sm break-words whitespace-pre-line">{item.message}</p>
      {(item.screenshot_path || isDemo) && (
        <div className="flex items-center gap-2">
          {item.screenshot_path && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Paperclip className="size-3" aria-hidden />
              Screenshot
            </span>
          )}
          {isDemo && (
            <Button size="xs" variant="ghost" className="ml-auto" onClick={() => void copyText(feedbackText(item)).then(setCopied)}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? 'Copied' : copied === false ? "Couldn't copy" : 'Copy text'}
            </Button>
          )}
        </div>
      )}
    </li>
  )
}
