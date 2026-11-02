import { MessageSquareWarning } from 'lucide-react'
import { useLocation } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/features/auth/authStore'
import { useFeedbackStore } from '@/features/feedback/feedbackStore'
import { ModeChip } from '@/features/mode/ModeChip'

export function TopBar() {
  const isDemo = useAuthStore((state) => state.status === 'demo')
  const { pathname } = useLocation()
  const showFeedback = useFeedbackStore((state) => state.show)

  return (
    <header className="pt-safe border-b bg-background">
      <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between gap-3 px-4 lg:max-w-none lg:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-heading text-base font-semibold tracking-tight">Ekagra</span>
          {isDemo && <Badge variant="secondary">Demo</Badge>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* Feedback from any screen: the sheet notes which screen it was. */}
          <Button variant="ghost" size="icon" aria-label="Send feedback or report a bug" title="Send feedback" onClick={() => showFeedback(pathname)}>
            <MessageSquareWarning aria-hidden />
          </Button>
          <ModeChip />
        </div>
      </div>
    </header>
  )
}
