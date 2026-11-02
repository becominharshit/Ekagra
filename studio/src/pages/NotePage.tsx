import { useMemo } from 'react'
import { format } from 'date-fns'
import { LoaderCircle } from 'lucide-react'
import { useParams } from 'react-router'
import { Markdown } from '@/components/Markdown'
import { PageHeader } from '@/components/layout/PageHeader'
import { useSubject } from '@/features/academics/subjects'
import { MindMap } from '@/features/notes/MindMap'
import { noteKindLabel, noteSourceLabel, useNote, type Note } from '@/features/notes/notes'
import { parseOutline } from '@/features/notes/outline'
import { BackLink } from '@studio/components/BackLink'

/** Long text reads better a little larger, with headings that stand out (as in Ekagra). */
const READING = 'text-base [&_h1]:text-xl [&_h2]:mt-6 [&_h2]:text-lg [&_h3]:mt-4'

/** One note, mind map or revision sheet. */
export function NotePage() {
  const { noteId } = useParams()
  const note = useNote(noteId)

  if (note.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading…
      </p>
    )
  }
  if (!note.data) {
    return (
      <>
        <BackLink to="/" label="Library" />
        <p role="alert" className="text-sm text-destructive">
          {note.error?.message ?? 'This note was not found. It may have been deleted.'}
        </p>
      </>
    )
  }
  return <NoteView key={note.data.id} note={note.data} />
}

function NoteView({ note }: { note: Note }) {
  const subject = useSubject(note.subject_id)
  const outline = useMemo(() => (note.kind === 'mind_map' ? parseOutline(note.content, note.title) : null), [note.kind, note.content, note.title])
  const details = [noteKindLabel(note.kind), noteSourceLabel(note.source), `updated ${format(new Date(note.updated_at), 'd MMM yyyy')}`].filter(Boolean)

  return (
    <>
      <BackLink to={`/subjects/${note.subject_id}`} label={subject.data?.name ?? 'Subject'} />
      <PageHeader title={note.title} subtitle={details.join(' · ')} />
      {note.status === 'processing' ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Being made… Long videos and PDFs take a few minutes; this page updates by itself.
        </p>
      ) : note.status === 'failed' ? (
        <p role="alert" className="text-sm text-destructive">
          This couldn't be made{note.error ? `: ${note.error.replace(/\.$/, '')}.` : '.'}
        </p>
      ) : outline ? (
        <MindMap root={outline} />
      ) : note.content.trim() === '' ? (
        <p className="text-sm text-muted-foreground">This note is empty.</p>
      ) : (
        <article className="max-w-3xl">
          <Markdown className={READING}>{note.content}</Markdown>
        </article>
      )}
    </>
  )
}
