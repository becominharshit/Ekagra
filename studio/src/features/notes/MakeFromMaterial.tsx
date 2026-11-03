import { useState } from 'react'
import { FileText, ListChecks, LoaderCircle, Network, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router'
import type { StudioNoteKind } from '@shared/schemas.ts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAcademicsMutation } from '@/features/academics/subjects'
import { useProfile } from '@/features/profile/queries'
import type { Material } from '@studio/features/library/library'
import { NoteList } from '@studio/features/library/lists'
import { makeNotes } from './makeNotes'
import { useStudioNotes } from './studioNotes'

const OPTIONS: { kind: StudioNoteKind; label: string; about: string; icon: LucideIcon }[] = [
  { kind: 'notes', label: 'Notes', about: 'Everything, in order, with the key points', icon: FileText },
  { kind: 'mind_map', label: 'Mind map', about: 'The big picture at a glance', icon: Network },
  { kind: 'revision_sheet', label: 'Revision sheet', about: 'One page for the night before', icon: ListChecks },
]

const READS: Record<string, string> = {
  youtube: 'Gemini watches the video: public videos of up to 3 hours. A long lecture takes about a minute.',
  pdf: "Gemini reads the PDF's text, about 25 to 40 pages at a time.",
  image: 'Gemini reads the photo.',
  text: 'Gemini reads your text.',
}

/** On a material's page: make notes, a mind map or a revision sheet from it, and what was made before. */
export function MakeFromMaterial({ material }: { material: Material }) {
  const navigate = useNavigate()
  const profile = useProfile()
  const make = useAcademicsMutation(makeNotes)
  const made = useStudioNotes({ materialId: material.id })
  const [making, setMaking] = useState<StudioNoteKind | null>(null)
  const [firstPage, setFirstPage] = useState('1')
  const subjectId = material.subject_id

  function start(kind: StudioNoteKind) {
    if (!subjectId) return
    setMaking(kind)
    make.mutate(
      { material, kind, subjectId, firstPage: Math.max(1, Number.parseInt(firstPage, 10) || 1), program: profile.data?.program, year: profile.data?.year },
      { onSuccess: (noteId) => navigate(`/notes/${noteId}`), onSettled: () => setMaking(null) },
    )
  }

  return (
    <section className="mb-6 grid gap-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="font-heading font-medium">Make from this</h2>
        <p className="text-sm text-muted-foreground">{READS[material.kind] ?? 'Gemini reads it.'}</p>
      </div>
      {subjectId ? (
        <div className="grid gap-2 sm:grid-cols-3">
          {OPTIONS.map(({ kind, label, about, icon: Icon }) => (
            <Button key={kind} variant="outline" className="h-auto justify-start gap-3 px-3 py-2.5 text-left" disabled={make.isPending} onClick={() => start(kind)}>
              {making === kind ? <LoaderCircle className="animate-spin" aria-hidden /> : <Icon className="text-studio" aria-hidden />}
              <span className="grid">
                <span className="font-medium">{label}</span>
                <span className="text-xs font-normal whitespace-normal text-muted-foreground">{about}</span>
              </span>
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-sm">Choose a subject for it first (above): notes are filed under a subject, where Ekagra shows them too.</p>
      )}
      {material.kind === 'pdf' && subjectId && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Label htmlFor="first-page">Start at page</Label>
          <Input id="first-page" inputMode="numeric" className="h-8 w-20" value={firstPage} onChange={(event) => setFirstPage(event.target.value.replace(/\D/g, ''))} />
          {material.page_count ? <span className="text-xs text-muted-foreground">of {material.page_count}</span> : null}
        </div>
      )}
      {make.error && (
        <p role="alert" className="text-sm text-destructive">
          {make.error.message}
        </p>
      )}
      {(made.data ?? []).length > 0 && (
        <div className="grid gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">Made from this</h3>
          <NoteList notes={made.data ?? []} />
        </div>
      )}
    </section>
  )
}
