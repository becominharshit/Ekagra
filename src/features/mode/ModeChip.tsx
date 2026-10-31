import { format } from 'date-fns'
import { BookOpen, Coffee, HeartPulse, Rocket, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { useNow } from '@/hooks/useNow'
import { cn } from '@/lib/utils'
import { activeBlock, MODE_LABEL, MODE_TONE, type Mode } from './modes'
import { useModeStore } from './modeStore'

const MODE_ICON: Record<Mode, LucideIcon> = {
  study: BookOpen,
  hustle: Rocket,
  life: HeartPulse,
  free: Coffee,
}

/** The chip in the top bar: what your plan says right now, e.g. "Study · until 6:00 PM". */
export function ModeChip() {
  const now = useNow()
  const block = activeBlock(
    useModeStore((state) => state.block),
    now,
  )
  const mode: Mode = block?.mode ?? 'free'
  const Icon = MODE_ICON[mode]
  const until = block ? format(new Date(block.endsAt), 'h:mm a') : null

  return (
    <Link
      to="/today"
      aria-label={until ? `Current mode: ${MODE_LABEL[mode]} until ${until}` : `Current mode: ${MODE_LABEL[mode]}`}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium ring-1 ring-inset transition-colors',
        MODE_TONE[mode],
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      <span>{MODE_LABEL[mode]}</span>
      {until && <span className="opacity-80">· until {until}</span>}
    </Link>
  )
}
