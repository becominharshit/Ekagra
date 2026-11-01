import { Layers, Lightbulb, LoaderCircle, MessageCircleQuestion, Shapes, Sparkles } from 'lucide-react'
import type { AnchorAction } from '@shared/schemas.ts'
import { Button } from '@/components/ui/button'
import { ACTION_LABEL } from './anchors'

const ACTIONS: { action: AnchorAction; icon: typeof Lightbulb }[] = [
  { action: 'explain', icon: Lightbulb },
  { action: 'simplify', icon: Sparkles },
  { action: 'example', icon: Shapes },
  { action: 'flashcards', icon: Layers },
  { action: 'ask', icon: MessageCircleQuestion },
]

/**
 * The 1-click AI actions for the selected text. It sticks to the bottom of the screen while text
 * is selected. Pressing a button doesn't clear the selection (preventDefault on pointer down).
 */
export function AnchorBar({ busy, onAction }: { busy: boolean; onAction: (action: AnchorAction) => void }) {
  return (
    <div className="sticky bottom-2 z-20 rounded-xl border bg-background/95 p-2 shadow-lg backdrop-blur">
      {busy ? (
        <p className="flex items-center justify-center gap-2 py-1.5 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Thinking…
        </p>
      ) : (
        <div className="flex gap-1 overflow-x-auto" role="toolbar" aria-label="AI help for the selected text">
          {ACTIONS.map(({ action, icon: Icon }) => (
            <Button
              key={action}
              size="sm"
              variant={action === 'explain' ? 'default' : 'ghost'}
              className="shrink-0"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => onAction(action)}
            >
              <Icon aria-hidden />
              {ACTION_LABEL[action]}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
