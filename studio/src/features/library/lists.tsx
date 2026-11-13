import type { ReactNode } from 'react'
import { format } from 'date-fns'
import { LoaderCircle } from 'lucide-react'
import { countLabel } from '@/features/academics/labels'
import { noteIcon } from '@/features/materials/kinds'
import { noteKindLabel, noteSourceLabel, type NoteSummary } from '@/features/notes/notes'
import { cn } from '@/lib/utils'
import { stillMaking } from '@studio/features/notes/studioNotes'
import { StudioLink } from '@studio/lib/studioPath'
import { kindIcon, kindLabel } from './kinds'
import type { Material } from './library'

const rowClass = 'flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50'

/** Materials as a list; `subjectName` adds each one's subject (for lists across subjects). */
export function MaterialList({ materials, subjectName }: { materials: Material[]; subjectName?: (id: string | null) => string | null }) {
  return (
    <ul className="grid divide-y overflow-hidden rounded-xl border bg-card">
      {materials.map((material) => {
        const Icon = kindIcon(material.kind)
        const details = [
          kindLabel(material.kind),
          material.kind === 'pdf' && material.page_count ? countLabel(material.page_count, 'page') : null,
          subjectName ? (subjectName(material.subject_id) ?? 'No subject') : null,
          format(new Date(material.created_at), 'd MMM'),
        ].filter(Boolean)
        return (
          <li key={material.id}>
            <StudioLink to={`/materials/${material.id}`} className={rowClass}>
              <Icon className="size-4 shrink-0 text-studio" aria-hidden />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate text-sm font-medium">{material.title}</span>
                <span className="text-xs text-muted-foreground">{details.join(' · ')}</span>
              </span>
            </StudioLink>
          </li>
        )
      })}
    </ul>
  )
}

/** Notes, mind maps and revision sheets as a list; ones still being made or that failed say so. */
export function NoteList({ notes }: { notes: NoteSummary[] }) {
  return (
    <ul className="grid divide-y overflow-hidden rounded-xl border bg-card">
      {notes.map((note) => {
        const making = stillMaking(note)
        // Failed, or 'processing' for so long that it has stopped.
        const broken = note.status === 'failed' || (note.status === 'processing' && !making)
        const Icon = making ? LoaderCircle : noteIcon(note.kind)
        const details = [
          making ? 'Being made…' : broken ? "Couldn't be made" : noteKindLabel(note.kind),
          noteSourceLabel(note.source),
          format(new Date(note.updated_at), 'd MMM'),
        ].filter(Boolean)
        return (
          <li key={note.id}>
            <StudioLink to={`/notes/${note.id}`} className={rowClass}>
              <Icon className={cn('size-4 shrink-0 text-studio', making && 'animate-spin', broken && 'text-destructive')} aria-hidden />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate text-sm font-medium">{note.title}</span>
                <span className={cn('text-xs text-muted-foreground', broken && 'text-destructive')}>{details.join(' · ')}</span>
              </span>
            </StudioLink>
          </li>
        )
      })}
    </ul>
  )
}

/** An empty list's place: one quiet line. */
export function EmptyList({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>
}
