import { useState } from 'react'
import { LoaderCircle, Plus } from 'lucide-react'
import { useParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { useSubject } from '@/features/academics/subjects'
import { BackLink } from '@studio/components/BackLink'
import { AddMaterialDialog } from '@studio/features/library/AddMaterialDialog'
import { useLibrary } from '@studio/features/library/library'
import { EmptyList, MaterialList, NoteList } from '@studio/features/library/lists'
import { useStudioNotes } from '@studio/features/notes/studioNotes'

/** One subject: its materials and the notes made from them. */
export function SubjectPage() {
  const { subjectId } = useParams()
  return <SubjectView key={subjectId} subjectId={subjectId ?? ''} />
}

/** Materials not filed under a subject yet. */
export function UnfiledPage() {
  return <SubjectView subjectId={null} />
}

function SubjectView({ subjectId }: { subjectId: string | null }) {
  const subject = useSubject(subjectId ?? undefined)
  const library = useLibrary()
  const notes = useStudioNotes(subjectId ? { subjectId } : null)
  const [adding, setAdding] = useState(false)

  if (library.isPending || (subjectId && subject.isPending)) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading…
      </p>
    )
  }
  if (subjectId && !subject.data) {
    return (
      <>
        <BackLink to="/" label="Library" />
        <p role="alert" className="text-sm text-destructive">
          {subject.error?.message ?? 'This subject was not found. It may have been deleted in Ekagra.'}
        </p>
      </>
    )
  }

  const materials = (library.data ?? []).filter((material) => material.subject_id === subjectId)
  return (
    <>
      <BackLink to="/" label="Library" />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{subject.data?.name ?? 'No subject'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {subjectId ? 'Its materials, and the notes, mind maps and revision sheets made from them.' : 'Materials not filed under a subject yet.'}
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus aria-hidden />
          Add
        </Button>
      </div>

      <div className={subjectId ? 'grid gap-8 lg:grid-cols-[3fr_2fr]' : 'grid gap-8'}>
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Materials</h2>
          {materials.length > 0 ? (
            <MaterialList materials={materials} />
          ) : (
            <EmptyList>{subjectId ? 'Add PDFs, photos of your notes or YouTube lectures for this subject.' : 'Nothing here: everything has a subject.'}</EmptyList>
          )}
        </section>
        {subjectId && (
          <section>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">Notes</h2>
            {notes.error ? (
              <p role="alert" className="text-sm text-destructive">
                {notes.error.message}
              </p>
            ) : (notes.data ?? []).length > 0 ? (
              <NoteList notes={notes.data ?? []} />
            ) : (
              <EmptyList>Open a material to make notes, a mind map or a revision sheet from it.</EmptyList>
            )}
          </section>
        )}
      </div>

      <AddMaterialDialog open={adding} onOpenChange={setAdding} subjectId={subjectId} />
    </>
  )
}
