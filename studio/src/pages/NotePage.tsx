import { useState } from 'react'
import { format } from 'date-fns'
import { LoaderCircle, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import type { StudioNoteKind } from '@shared/schemas.ts'
import { Markdown } from '@/components/Markdown'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useAcademicsMutation, useSubject } from '@/features/academics/subjects'
import { MindMap } from '@/features/notes/MindMap'
import { NoteBody } from '@/features/notes/NoteBody'
import { noteKindLabel, noteSourceLabel, useNote, type Note } from '@/features/notes/notes'
import { parseOutline } from '@/features/notes/outline'
import { useProfile } from '@/features/profile/queries'
import type { DataSource } from '@/lib/dataSource'
import { BackLink } from '@studio/components/BackLink'
import { useLibrary } from '@studio/features/library/library'
import { makeNotes, type MakeNotesInput } from '@studio/features/notes/makeNotes'
import { deleteNote, stillMaking, updateNote } from '@studio/features/notes/studioNotes'
import { NoteQuiz } from '@studio/features/quiz/NoteQuiz'

/** Long text reads better a little larger, with headings that stand out (as in Ekagra). */
const READING = 'text-base [&_h1]:text-xl [&_h2]:mt-6 [&_h2]:text-lg [&_h3]:mt-4'

/** "Try again": a new note from the same material, then the failed one goes. */
async function makeAgain(source: DataSource, { input, failedId }: { input: MakeNotesInput; failedId: string }): Promise<string> {
  const noteId = await makeNotes(source, input)
  await deleteNote(source, failedId)
  return noteId
}

/** One note, mind map or revision sheet: read it, edit it, or delete it. */
export function NotePage() {
  const { noteId } = useParams()
  // While it's being made, check every 5 seconds.
  const note = useNote(noteId, 5_000)

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
  const navigate = useNavigate()
  const subject = useSubject(note.subject_id)
  const library = useLibrary()
  const profile = useProfile()
  const save = useAcademicsMutation(updateNote)
  const remove = useAcademicsMutation(deleteNote)
  const retry = useAcademicsMutation(makeAgain)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const making = stillMaking(note)
  const broken = note.status === 'failed' || (note.status === 'processing' && !making)
  const material = library.data?.find((item) => item.id === note.material_id) ?? null
  const details = [noteKindLabel(note.kind), noteSourceLabel(note.source), `updated ${format(new Date(note.updated_at), 'd MMM yyyy')}`].filter(Boolean)
  const backToSubject = () => navigate(`/subjects/${note.subject_id}`, { replace: true })

  function tryAgain() {
    if (!material) return
    const input: MakeNotesInput = { material, kind: note.kind as StudioNoteKind, subjectId: note.subject_id, program: profile.data?.program, year: profile.data?.year }
    retry.mutate({ input, failedId: note.id }, { onSuccess: (noteId) => navigate(`/notes/${noteId}`, { replace: true }) })
  }

  return (
    <>
      <BackLink to={`/subjects/${note.subject_id}`} label={subject.data?.name ?? 'Subject'} />
      {editing ? (
        <NoteEditor
          note={note}
          saving={save.isPending}
          error={save.error?.message ?? null}
          onCancel={() => setEditing(false)}
          onSave={(title, content) => save.mutate({ id: note.id, title, content }, { onSuccess: () => setEditing(false) })}
        />
      ) : (
        <>
          <PageHeader title={note.title} subtitle={details.join(' · ')} />
          <div className="-mt-2 mb-5 flex flex-wrap gap-2">
            {note.status === 'ready' && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil aria-hidden />
                Edit
              </Button>
            )}
            {broken && material && (
              <Button size="sm" disabled={retry.isPending} onClick={tryAgain}>
                {retry.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
                Try again
              </Button>
            )}
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleting(true)}>
              <Trash2 aria-hidden />
              Delete
            </Button>
          </div>
          {retry.error && (
            <p role="alert" className="mb-4 text-sm text-destructive">
              {retry.error.message}
            </p>
          )}

          {making ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              Being made… This usually takes under a minute. This page updates by itself, and you can leave it meanwhile.
            </p>
          ) : broken ? (
            <p role="alert" className="text-sm text-destructive">
              {note.status === 'processing'
                ? 'This stopped before it was done.'
                : `This couldn't be made${note.error ? `: ${note.error.replace(/\.$/, '')}.` : '.'}`}
              {material ? ' Try again, or delete it.' : ' Its material was deleted, so delete this.'}
            </p>
          ) : (
            <NoteBody kind={note.kind} title={note.title} content={note.content} />
          )}
          {note.status === 'ready' && note.content.trim() !== '' && <NoteQuiz note={note} />}
        </>
      )}

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{note.title}”?</AlertDialogTitle>
            <AlertDialogDescription>It's deleted in Ekagra too. Its material stays.</AlertDialogDescription>
          </AlertDialogHeader>
          {remove.error && (
            <p role="alert" className="text-sm text-destructive">
              {remove.error.message}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault()
                remove.mutate(note.id, { onSuccess: backToSubject })
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

interface NoteEditorProps {
  note: Note
  saving: boolean
  error: string | null
  onCancel: () => void
  onSave: (title: string, content: string) => void
}

/** Edit the title and the Markdown (a mind map is its outline), with a preview. */
function NoteEditor({ note, saving, error, onCancel, onSave }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [view, setView] = useState<'write' | 'preview'>('write')
  const outline = note.kind === 'mind_map' ? parseOutline(content, title) : null

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="note-title">Title</Label>
        <Input id="note-title" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(next) => next && setView(next === 'preview' ? 'preview' : 'write')} className="justify-self-start">
        <ToggleGroupItem value="write">Write</ToggleGroupItem>
        <ToggleGroupItem value="preview">Preview</ToggleGroupItem>
      </ToggleGroup>
      {view === 'write' ? (
        <div className="grid gap-1">
          <Textarea aria-label="Markdown" rows={22} className="font-mono text-sm" value={content} onChange={(event) => setContent(event.target.value)} />
          <p className="text-xs text-muted-foreground">
            {note.kind === 'mind_map'
              ? 'A mind map is an outline: "# " for the centre, "## " for branches, "- " for points (indent two spaces to nest).'
              : 'Markdown: "## " for headings, "- " for points, **bold**, `code`.'}
          </p>
        </div>
      ) : outline ? (
        <MindMap root={outline} />
      ) : (
        <article className="max-w-3xl rounded-xl border p-4">
          <Markdown className={READING}>{content || '_Empty_'}</Markdown>
        </article>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button disabled={saving || !title.trim()} onClick={() => onSave(title, content)}>
          {saving && <LoaderCircle className="animate-spin" aria-hidden />}
          Save
        </Button>
        <Button variant="outline" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
