import type { ReactNode } from 'react'
import { format } from 'date-fns'
import { FileText, ListChecks, LoaderCircle, Network, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { countLabel } from '@/features/academics/labels'
import { noteKindLabel, noteSourceLabel, type NoteSummary } from '@/features/notes/notes'
import { cn } from '@/lib/utils'
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
            <Link to={`/materials/${material.id}`} className={rowClass}>
              <Icon className="size-4 shrink-0 text-studio" aria-hidden />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate text-sm font-medium">{material.title}</span>
                <span className="text-xs text-muted-foreground">{details.join(' · ')}</span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

const NOTE_ICON: Record<string, LucideIcon> = { notes: FileText, mind_map: Network, revision_sheet: ListChecks }

/** Notes, mind maps and revision sheets as a list; ones still being made or that failed say so. */
export function NoteList({ notes }: { notes: NoteSummary[] }) {
  return (
    <ul className="grid divide-y overflow-hidden rounded-xl border bg-card">
      {notes.map((note) => {
        const Icon = note.status === 'processing' ? LoaderCircle : (NOTE_ICON[note.kind] ?? FileText)
        const details = [
          note.status === 'processing' ? 'Being made…' : note.status === 'failed' ? "Couldn't be made" : noteKindLabel(note.kind),
          noteSourceLabel(note.source),
          format(new Date(note.updated_at), 'd MMM'),
        ].filter(Boolean)
        return (
          <li key={note.id}>
            <Link to={`/notes/${note.id}`} className={rowClass}>
              <Icon className={cn('size-4 shrink-0 text-studio', note.status === 'processing' && 'animate-spin', note.status === 'failed' && 'text-destructive')} aria-hidden />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate text-sm font-medium">{note.title}</span>
                <span className={cn('text-xs text-muted-foreground', note.status === 'failed' && 'text-destructive')}>{details.join(' · ')}</span>
              </span>
            </Link>
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
