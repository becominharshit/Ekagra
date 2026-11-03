import { useRef, useState, type ChangeEvent } from 'react'
import { format } from 'date-fns'
import { ArrowLeft, ExternalLink, Library, LoaderCircle, Trash2, Upload } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAcademicsMutation, useSubjects } from '@/features/academics/subjects'
import { useAuthStore } from '@/features/auth/authStore'
import { openStudioPage } from '@/features/bridge/studio'
import { MaterialIcon, NoteIcon } from '@/features/materials/KindIcons'
import { materialSummary } from '@/features/materials/kinds'
import { ALL_SUBJECTS, isLibraryType, LIBRARY_TYPE_LABEL, LIBRARY_TYPES, libraryItems, NO_SUBJECT, type LibraryItem, type LibraryType } from '@/features/materials/libraryItems'
import { addPdf, deleteMaterial, materialPath, useStudyMaterials, type Material } from '@/features/materials/materials'
import { noteKindLabel, noteSourceLabel, useNotes } from '@/features/notes/notes'

/**
 * Everything the student studies from: PDFs (opened here with 1-click AI help), YouTube videos,
 * photos and text, and the notes, mind maps and revision sheets Ekagra Studio made from them.
 */
export function LibraryPage() {
  const navigate = useNavigate()
  const isDemo = useAuthStore((state) => state.status === 'demo')
  const [params, setParams] = useSearchParams()
  const subject = params.get('subject') ?? ALL_SUBJECTS
  const typeParam = params.get('type')
  const type: LibraryType = isLibraryType(typeParam) ? typeParam : 'all'
  const materials = useStudyMaterials()
  const notes = useNotes()
  const subjects = useSubjects()
  const add = useAcademicsMutation(addPdf)
  const remove = useAcademicsMutation(deleteMaterial)
  const [deleting, setDeleting] = useState<Material | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const chosenSubject = subject !== ALL_SUBJECTS && subject !== NO_SUBJECT ? subject : null
  const subjectName = (id: string | null) => (id ? (subjects.data?.find((item) => item.id === id)?.name ?? null) : 'No subject')
  const items = libraryItems(materials.data ?? [], notes.data ?? [], { subject, type })
  const filtered = subject !== ALL_SUBJECTS || type !== 'all'

  function show(next: { subject?: string; type?: LibraryType }) {
    const chosen = { subject, type, ...next }
    const search: Record<string, string> = {}
    if (chosen.subject !== ALL_SUBJECTS) search.subject = chosen.subject
    if (chosen.type !== 'all') search.type = chosen.type
    setParams(search, { replace: true })
  }

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    add.mutate({ file, subjectId: chosenSubject }, { onSuccess: (material) => navigate(materialPath(material)) })
  }

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link to="/academics">
          <ArrowLeft aria-hidden />
          Academics
        </Link>
      </Button>
      <PageHeader title="Library" subtitle="Everything you study from: PDFs, YouTube lectures, photos and text, with the notes Ekagra Studio made from them." />

      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={add.isPending} onClick={() => fileInput.current?.click()}>
            {add.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
            {add.isPending ? 'Adding the PDF…' : 'Add a PDF'}
          </Button>
          <input ref={fileInput} type="file" accept="application/pdf" className="hidden" aria-label="PDF to add" onChange={choose} />
          {!isDemo && (
            <Button variant="outline" onClick={() => void openStudioPage(chosenSubject ? `subjects/${chosenSubject}` : '')}>
              <ExternalLink aria-hidden />
              Open Studio
            </Button>
          )}
          <Select value={subject} onValueChange={(next) => show({ subject: next })}>
            <SelectTrigger aria-label="Subject">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SUBJECTS}>All subjects</SelectItem>
              {subjects.data?.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
              <SelectItem value={NO_SUBJECT}>No subject</SelectItem>
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={(next) => show({ type: isLibraryType(next) ? next : 'all' })}>
            <SelectTrigger aria-label="Type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIBRARY_TYPES.map((option) => (
                <SelectItem key={option} value={option}>
                  {LIBRARY_TYPE_LABEL[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          {isDemo
            ? 'Demo Mode keeps PDFs on this device only. YouTube lectures and notes come from Ekagra Studio, which needs sign-in.'
            : 'PDFs open here, with 1-click AI help on any page. Add YouTube lectures and make notes, mind maps and quizzes in Ekagra Studio: they show up here.'}
          {chosenSubject && ' New PDFs go into the chosen subject.'}
        </p>
        {(add.error || remove.error || materials.error || notes.error) && (
          <p role="alert" className="text-sm text-destructive">
            {add.error?.message ?? remove.error?.message ?? materials.error?.message ?? notes.error?.message}
          </p>
        )}

        {(materials.isPending || notes.isPending) && <p className="text-sm text-muted-foreground">Loading…</p>}
        {materials.data && notes.data && items.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Library className="size-4" aria-hidden />
                {filtered ? 'Nothing here' : 'Your library is empty'}
              </CardTitle>
              <CardDescription>
                {filtered
                  ? 'Nothing matches this subject and type. Choose "All subjects" or "Everything" to see more.'
                  : 'Add lecture notes or a textbook chapter as a PDF, then select any text in it to ask the AI. YouTube lectures and notes come from Ekagra Studio.'}
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {items.length > 0 && (
          <Card size="sm">
            <CardContent>
              <ul className="grid">
                {items.map((item) => (
                  <ItemRow key={`${item.kind}-${item.id}`} item={item} subjectName={subject === ALL_SUBJECTS ? subjectName : null} onDelete={setDeleting} />
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.kind === 'pdf'
                ? 'The PDF and the AI answers saved on its pages are deleted, in Ekagra Studio too. Flashcards and notes made from it stay.'
                : "It's deleted in Ekagra Studio too. Notes made from it stay."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) remove.mutate(deleting)
                setDeleting(null)
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

interface ItemRowProps {
  item: LibraryItem
  /** Names the subject of each row (when all subjects are shown). */
  subjectName: ((id: string | null) => string | null) | null
  onDelete: (material: Material) => void
}

/** A material (with Delete) or a note from Studio (edited there). */
function ItemRow({ item, subjectName, onDelete }: ItemRowProps) {
  const iconClass = 'mt-0.5 size-4 shrink-0 text-mode-study'
  const title = item.kind === 'material' ? item.material.title : item.note.title
  const details =
    item.kind === 'material'
      ? [materialSummary(item.material), subjectName?.(item.material.subject_id), format(new Date(item.at), 'd MMM')]
      : [noteKindLabel(item.note.kind), noteSourceLabel(item.note.source), subjectName?.(item.note.subject_id), format(new Date(item.at), 'd MMM')]
  return (
    <li className="flex items-center gap-1">
      <Link to={item.to} className="-mx-2 flex min-w-0 flex-1 items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted">
        {item.kind === 'material' ? <MaterialIcon kind={item.material.kind} className={iconClass} aria-hidden /> : <NoteIcon kind={item.note.kind} className={iconClass} aria-hidden />}
        <span className="grid min-w-0 gap-0.5">
          <span className="truncate font-medium">{title}</span>
          <span className="text-xs text-muted-foreground">{details.filter(Boolean).join(' · ')}</span>
        </span>
      </Link>
      {item.kind === 'material' && (
        <Button variant="ghost" size="icon" aria-label={`Delete ${title}`} className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => onDelete(item.material)}>
          <Trash2 aria-hidden />
        </Button>
      )}
    </li>
  )
}
