import { format } from 'date-fns'
import { ExternalLink, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAcademicsMutation } from '@/features/academics/subjects'
import { useAuthStore } from '@/features/auth/authStore'
import { openStudioPage } from '@/features/bridge/studio'
import { NoteIcon } from '@/features/materials/KindIcons'
import { noteKindLabel, noteSourceLabel, seedSampleNotes, useSubjectNotes, type NoteSummary } from './notes'

/** The subject's notes from Ekagra Studio: read here, made and edited there. */
export function SubjectNotes({ subjectId }: { subjectId: string }) {
  const isDemo = useAuthStore((state) => state.status === 'demo')
  const notes = useSubjectNotes(subjectId)
  const seed = useAcademicsMutation(seedSampleNotes)
  const list = notes.data ?? []

  const description =
    list.length > 0
      ? isDemo
        ? 'Sample notes in Demo Mode (try Typed, Handwritten, Contents and PDF).'
        : 'Made in Ekagra Studio. Edit them there.'
      : isDemo
        ? 'Try a sample lecture note and mind map here in Demo Mode, or sign in to make your own in Ekagra Studio.'
        : 'Make notes, mind maps and revision sheets from your PDFs, photos and YouTube videos in Ekagra Studio. They show up here.'

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Notes{list.length > 0 ? ` (${list.length})` : ''}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {!isDemo ? (
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => void openStudioPage(`subjects/${subjectId}`)}>
              <ExternalLink aria-hidden />
              Open Studio
            </Button>
          </CardAction>
        ) : list.length === 0 ? (
          <CardAction>
            <Button variant="outline" size="sm" disabled={seed.isPending} onClick={() => seed.mutate(subjectId)}>
              <Sparkles aria-hidden />
              Load sample notes
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      {(notes.error || list.length > 0) && (
        <CardContent>
          {notes.error ? (
            <p role="alert" className="text-sm text-destructive">
              {notes.error.message}
            </p>
          ) : (
            <ul className="grid">
              {list.map((note) => (
                <NoteRow key={note.id} note={note} />
              ))}
            </ul>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function NoteRow({ note }: { note: NoteSummary }) {
  const details = [noteKindLabel(note.kind), noteSourceLabel(note.source), format(new Date(note.updated_at), 'd MMM')].filter(Boolean)
  return (
    <li>
      <Link to={`/academics/notes/${note.id}`} className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted">
        <NoteIcon kind={note.kind} className="mt-0.5 size-4 shrink-0 text-mode-study" aria-hidden />
        <span className="grid min-w-0 gap-0.5">
          <span className="truncate font-medium">{note.title}</span>
          <span className="text-xs text-muted-foreground">{details.join(' · ')}</span>
        </span>
      </Link>
    </li>
  )
}
