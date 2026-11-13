import { LoaderCircle, RefreshCw, Sunrise } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/features/auth/authStore'
import { cn } from '@/lib/utils'
import { useMorningBrief } from './brief'

/** 3 lines on what matters today and why, written once a day. */
export function MorningBrief() {
  const isDemo = useAuthStore((state) => state.status === 'demo')
  const { brief, isWriting, error, canRefresh, refresh } = useMorningBrief()

  let footer: string | null = null
  if (brief?.by === 'ai') footer = 'Written by the AI · kept for today'
  else if (brief && isDemo) footer = 'Made on your device (Demo Mode) · kept for today'
  else if (brief) {
    footer = brief.aiError?.startsWith('Cloud AI is temporarily unavailable')
      ? `${brief.aiError} Tap refresh to try again.`
      : `Made on your device: ${brief.aiError ?? 'Cloud AI is temporarily unavailable.'} Tap refresh to try the AI again.`
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sunrise className="size-4" aria-hidden />
          Morning brief
        </CardTitle>
        <CardAction>
          <Button variant="ghost" size="icon" aria-label="Write a new brief" disabled={!canRefresh || isWriting} onClick={refresh}>
            <RefreshCw className={cn(isWriting && 'animate-spin')} aria-hidden />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-2">
        {brief ? (
          <ul className="grid gap-1.5">
            {brief.lines.map((line, index) => (
              <li key={`${index}-${line.slice(0, 20)}`}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-muted-foreground">
            {isWriting && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            {isWriting ? 'Writing your brief…' : "Your brief appears once today's plan is ready."}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
        )}
        {footer && <p className="text-xs text-muted-foreground">{footer}</p>}
      </CardContent>
    </Card>
  )
}
