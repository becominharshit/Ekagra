import { cn } from '@/lib/utils'
import type { OcclusionPayload } from './occlusion'

interface ImageOcclusionViewProps {
  occlusion: OcclusionPayload
  /** When false, the active target mask stays covered. When true, the answer region is uncovered. */
  revealed: boolean
  compact?: boolean
  className?: string
}

/** Renders an Image Occlusion diagram with all sibling masks dimmed and the active test region masked until revealed. */
export function ImageOcclusionView({ occlusion, revealed, compact = false, className }: ImageOcclusionViewProps) {
  return (
    <div className={cn('relative overflow-hidden rounded-lg border bg-muted/20', compact ? 'max-h-48' : 'max-h-96', className)}>
      <img
        src={occlusion.imageUrl}
        alt={occlusion.prompt}
        className={cn('block h-auto w-full select-none object-contain', compact ? 'max-h-48' : 'max-h-96')}
      />
      <div className="pointer-events-none absolute inset-0">
        {occlusion.masks.map((mask, index) => {
          const isTarget = index === occlusion.activeMaskIndex
          const hideLabel = isTarget && !revealed
          return (
            <div
              key={mask.id}
              aria-label={isTarget ? (revealed ? `Revealed region: ${mask.label}` : 'Hidden target region') : mask.label}
              style={{
                left: `${mask.x * 100}%`,
                top: `${mask.y * 100}%`,
                width: `${mask.width * 100}%`,
                height: `${mask.height * 100}%`,
              }}
              className={cn(
                'absolute flex items-center justify-center rounded-md border-2 transition-all',
                hideLabel
                  ? 'border-amber-600 bg-amber-400 text-amber-950 shadow-sm'
                  : isTarget
                    ? 'border-emerald-600 bg-emerald-500/15'
                    : 'border-slate-500/70 bg-slate-800/80 text-white',
              )}
            >
              {hideLabel ? (
                <span className="rounded bg-amber-950/15 px-1.5 py-0.5 text-xs font-bold tracking-wide">?</span>
              ) : !isTarget ? (
                <span className="sr-only">{mask.label}</span>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
