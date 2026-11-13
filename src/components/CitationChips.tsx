import { BookOpenText, Clock } from 'lucide-react'
import type { SourceCitation } from '@shared/schemas.ts'
import { Button } from '@/components/ui/button'

/** Clickable citation pills linking back to exact PDF pages or video lecture timestamps. */
export function CitationChips({
  citations,
  onCitePage,
  onCiteTimestamp,
}: {
  citations: readonly SourceCitation[]
  onCitePage?: (pageNumber: number) => void
  onCiteTimestamp?: (seconds: number) => void
}) {
  const actionable = citations.filter(
    (item) => (item.pageNumber !== null && onCitePage) || (item.timestampSec !== null && onCiteTimestamp),
  )
  if (actionable.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Source citations">
      <span className="text-xs font-medium text-muted-foreground">Sources:</span>
      {actionable.map((citation) => {
        if (citation.pageNumber !== null && onCitePage) {
          return (
            <Button
              key={`p-${citation.pageNumber}`}
              type="button"
              variant="outline"
              size="sm"
              className="h-6 rounded-full px-2.5 text-xs"
              title={citation.quote || `Jump to page ${citation.pageNumber}`}
              onClick={() => onCitePage(citation.pageNumber!)}
            >
              <BookOpenText className="size-3 text-primary" aria-hidden />
              {citation.label}
            </Button>
          )
        }
        if (citation.timestampSec !== null && onCiteTimestamp) {
          return (
            <Button
              key={`t-${citation.timestampSec}`}
              type="button"
              variant="outline"
              size="sm"
              className="h-6 rounded-full px-2.5 text-xs"
              title={citation.quote || `Jump to ${citation.label}`}
              onClick={() => onCiteTimestamp(citation.timestampSec!)}
            >
              <Clock className="size-3 text-primary" aria-hidden />
              {citation.label}
            </Button>
          )
        }
        return null
      })}
    </div>
  )
}
