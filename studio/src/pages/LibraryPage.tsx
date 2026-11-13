import { useState } from 'react'
import { ArrowUpRight, Inbox, LoaderCircle, Plus } from 'lucide-react'
import { StudioLink as Link } from '@studio/lib/studioPath'
import { Button } from '@/components/ui/button'
import { countLabel } from '@/features/academics/labels'
import { useSubjects } from '@/features/academics/subjects'
import { AddMaterialDialog } from '@studio/features/library/AddMaterialDialog'
import { useLibrary } from '@studio/features/library/library'
import { MaterialList } from '@studio/features/library/lists'
import { ekagraUrl } from '@studio/lib/links'
import { useStudioEmbedded } from '@studio/lib/studioHref'

/** The library: every subject with its materials, and what was added last. */
export function LibraryPage() {
  const embedded = useStudioEmbedded()
  const subjects = useSubjects()
  const library = useLibrary()
  const [adding, setAdding] = useState(false)
  const materials = library.data ?? []
  const count = (subjectId: string | null) => materials.filter((material) => material.subject_id === subjectId).length
  const subjectName = (id: string | null) => subjects.data?.find((subject) => subject.id === id)?.name ?? null
  const unfiled = count(null)
  const empty = subjects.data?.length === 0 && materials.length === 0

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">Everything you add here or in Ekagra, by subject.</p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus aria-hidden />
          Add
        </Button>
      </div>

      {(subjects.isPending || library.isPending) && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Loading…
        </p>
      )}
      {(subjects.error || library.error) && (
        <p role="alert" className="text-sm text-destructive">
          {subjects.error?.message ?? library.error?.message}
        </p>
      )}

      {empty && (
        <div className="grid justify-items-start gap-3 rounded-xl border border-dashed p-6">
          <p className="font-medium">Your library is empty</p>
          <p className="text-sm text-muted-foreground">
            Add your subjects in Ekagra first (Academics → Add subject), then add PDFs, photos of your notes or YouTube lectures here. Studio turns them
            into notes, mind maps and quizzes.
          </p>
          <div className="flex flex-wrap gap-2">
            {!embedded && (
              <Button asChild variant="outline">
                <a href={ekagraUrl('academics')} target="ekagra" rel="noopener">
                  <ArrowUpRight aria-hidden />
                  Open Ekagra
                </a>
              </Button>
            )}
            <Button variant="outline" onClick={() => setAdding(true)}>
              <Plus aria-hidden />
              Add something anyway
            </Button>
          </div>
        </div>
      )}

      {(subjects.data?.length ?? 0) + unfiled > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Subjects</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(subjects.data ?? []).map((subject) => (
              <li key={subject.id}>
                <Link to={`/subjects/${subject.id}`} className="grid gap-1 rounded-xl border bg-card p-4 transition-colors hover:border-studio/40 hover:bg-muted/30">
                  <span className="truncate font-medium">{subject.name}</span>
                  <span className="text-xs text-muted-foreground">{countLabel(count(subject.id), 'material')}</span>
                </Link>
              </li>
            ))}
            {unfiled > 0 && (
              <li>
                <Link to="/unfiled" className="grid gap-1 rounded-xl border border-dashed p-4 transition-colors hover:bg-muted/30">
                  <span className="flex items-center gap-2 font-medium">
                    <Inbox className="size-4 text-muted-foreground" aria-hidden />
                    No subject
                  </span>
                  <span className="text-xs text-muted-foreground">{countLabel(unfiled, 'material')}</span>
                </Link>
              </li>
            )}
          </ul>
        </section>
      )}

      {materials.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Added recently</h2>
          <MaterialList materials={materials.slice(0, 6)} subjectName={subjectName} />
        </section>
      )}

      <AddMaterialDialog open={adding} onOpenChange={setAdding} subjectId={null} />
    </>
  )
}
