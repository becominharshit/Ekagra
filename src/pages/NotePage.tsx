import { format } from 'date-fns'
import { ArrowLeft, ExternalLink, LoaderCircle } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useRoadmap } from '@/features/academics/roadmap'
import { useSubject } from '@/features/academics/subjects'
import { useAuthStore } from '@/features/auth/authStore'
import { openStudioPage } from '@/features/bridge/studio'
import { MaterialIcon } from '@/features/materials/KindIcons'
import { materialPath, useStudyMaterial } from '@/features/materials/materials'
import { NoteBody } from '@/features/notes/NoteBody'
import { noteKindLabel, noteSourceLabel, useNote, type Note } from '@/features/notes/notes'

/** One note from Ekagra Studio, to read. It's made and edited in Studio. */
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
      <div className="grid gap-3">
        <p role="alert" className="text-sm text-destructive">
          {note.error?.message ?? 'This note was not found. It may have been deleted in Ekagra Studio.'}
        </p>
        <Button asChild variant="outline" className="justify-self-start">
          <Link to="/academics">Back to Academics</Link>
        </Button>
      </div>
    )
  }
  return <NoteView key={note.data.id} note={note.data} />
}

function NoteView({ note }: { note: Note }) {
  const navigate = useNavigate()
  const isDemo = useAuthStore((state) => state.status === 'demo')
  const subject = useSubject(note.subject_id)
  const roadmap = useRoadmap(note.subject_id)
  // What it was made from, of any kind (a PDF, YouTube video, photo or text).
  const material = useStudyMaterial(note.material_id ?? undefined)
  const topic = roadmap.data?.topics.find((candidate) => candidate.id === note.topic_id) ?? null
  const details = [noteKindLabel(note.kind), noteSourceLabel(note.source), `updated ${format(new Date(note.updated_at), 'd MMM yyyy')}`].filter(Boolean)
  const onCitePage =
    material.data?.kind === 'pdf'
      ? (pageNumber: number) => navigate(`/academics/library/${material.data!.id}?page=${pageNumber}`)
      : undefined
  const onCiteTimestamp =
    material.data?.kind === 'youtube'
      ? (seconds: number) => navigate(`/academics/materials/${material.data!.id}?t=${seconds}`)
      : undefined

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link to={`/academics/subjects/${note.subject_id}`}>
          <ArrowLeft aria-hidden />
          {subject.data?.name ?? 'Subject'}
        </Link>
      </Button>
      <PageHeader title={note.title} subtitle={details.join(' · ')} />

      <div className="-mt-2 mb-5 flex flex-wrap gap-2">
        {topic && (
          <Button asChild variant="outline" size="sm">
            <Link to={`/academics/topics/${topic.id}`}>Topic: {topic.title}</Link>
          </Button>
        )}
        {material.data && (
          <Button asChild variant="outline" size="sm">
            <Link to={materialPath(material.data)}>
              <MaterialIcon kind={material.data.kind} aria-hidden />
              {material.data.title}
            </Link>
          </Button>
        )}
        {!isDemo && (
          <Button variant="outline" size="sm" onClick={() => void openStudioPage(`notes/${note.id}`)}>
            <ExternalLink aria-hidden />
            Edit in Studio
          </Button>
        )}
      </div>

      {note.status === 'processing' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              Ekagra Studio is still making this
            </CardTitle>
            <CardDescription>This usually takes under a minute. This page updates by itself.</CardDescription>
          </CardHeader>
        </Card>
      ) : note.status === 'failed' ? (
        <p role="alert" className="text-sm text-destructive">
          Ekagra Studio couldn't make this{note.error ? `: ${note.error.replace(/\.$/, '')}.` : '.'} Try again in Studio.
        </p>
      ) : (
        <NoteBody
          kind={note.kind}
          title={note.title}
          content={note.content}
          onCitePage={onCitePage}
          onCiteTimestamp={onCiteTimestamp}
        />
      )}
    </>
  )
}
