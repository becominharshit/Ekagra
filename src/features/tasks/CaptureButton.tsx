import { Plus } from 'lucide-react'
import { useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { useCaptureStore } from './captureStore'

/** Screens with their own buttons along the bottom (PDF viewer, code editor, reviews): no floating button there. */
const HIDDEN_ON = /^\/academics\/(library\/[^/]+|code\/[^/]+|review)$/

/** The floating + button on every screen: capture a task in a few seconds. */
export function CaptureButton() {
  const { pathname } = useLocation()
  const setOpen = useCaptureStore((state) => state.setOpen)
  if (HIDDEN_ON.test(pathname)) return null
  return (
    <Button
      size="icon"
      aria-label="Capture a task"
      className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 size-12 rounded-full shadow-lg lg:right-8 lg:bottom-8"
      onClick={() => setOpen(true)}
    >
      <Plus className="size-6" aria-hidden />
    </Button>
  )
}
