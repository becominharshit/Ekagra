import { useRef, useState, type ChangeEvent } from 'react'
import { ArrowLeft, FileText, LoaderCircle, Trash2, Upload } from 'lucide-react'
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
import { countLabel } from '@/features/academics/labels'
import { useAcademicsMutation, useSubjects } from '@/features/academics/subjects'
import { addPdf, deleteMaterial, useMaterials, type Material } from '@/features/materials/materials'
import { useAuthStore } from '@/features/auth/authStore'

const ALL = 'all'
const NONE = 'none'

/** Your PDFs. Open one, select text, and get 1-click AI help saved at that spot. */
export function LibraryPage() {
  const navigate = useNavigate()
  const isDemo = useAuthStore((state) => state.status === 'demo')
  const [params, setParams] = useSearchParams()
  const filter = params.get('subject') ?? ALL
  const materials = useMaterials()
  const subjects = useSubjects()
  const add = useAcademicsMutation(addPdf)
  const remove = useAcademicsMutation(deleteMaterial)
  const [deleting, setDeleting] = useState<Material | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const subjectName = (id: string | null) => subjects.data?.find((subject) => subject.id === id)?.name ?? null
  const shown = (materials.data ?? []).filter((material) => filter === ALL || material.subject_id === filter)

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    add.mutate({ file, subjectId: filter === ALL || filter === NONE ? null : filter }, { onSuccess: (material) => navigate(`/academics/library/${material.id}`) })
  }

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link to="/academics">
          <ArrowLeft aria-hidden />
          Academics
        </Link>
      </Button>
      <PageHeader title="Library" subtitle="Your PDFs. Select text on a page for 1-click AI help, saved right there." />

      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={add.isPending} onClick={() => fileInput.current?.click()}>
            {add.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
            {add.isPending ? 'Adding the PDF…' : 'Add a PDF'}
          </Button>
          <input ref={fileInput} type="file" accept="application/pdf" className="hidden" aria-label="PDF to add" onChange={choose} />
          <Select value={filter} onValueChange={(next) => setParams(next === ALL ? {} : { subject: next }, { replace: true })}>
            <SelectTrigger aria-label="Subject">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All subjects</SelectItem>
              {subjects.data?.map((subject) => (
                <SelectItem key={subject.id} value={subject.id}>
                  {subject.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          {isDemo
            ? 'Demo Mode keeps PDFs on this device only. Answers are samples made from the page (there is no AI).'
            : 'PDFs are stored privately in your account. Their text is read on your device.'}
          {filter !== ALL && ' New PDFs go into the chosen subject.'}
        </p>
        {(add.error || remove.error) && (
          <p role="alert" className="text-sm text-destructive">
            {add.error?.message ?? remove.error?.message}
          </p>
        )}

        {materials.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
        {materials.data && shown.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4" aria-hidden />
                No PDFs yet
              </CardTitle>
              <CardDescription>Add lecture notes or a textbook chapter. You can select any text in it and ask the AI.</CardDescription>
            </CardHeader>
          </Card>
        )}

        {shown.map((material) => (
          <Card key={material.id} size="sm">
            <CardHeader>
              <CardTitle>
                <Link to={`/academics/library/${material.id}`} className="hover:underline">
                  {material.title}
                </Link>
              </CardTitle>
              <CardDescription>
                {[subjectName(material.subject_id), material.page_count !== null ? countLabel(material.page_count, 'page') : null]
                  .filter(Boolean)
                  .join(' · ')}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button asChild size="sm">
                <Link to={`/academics/library/${material.id}`}>Open</Link>
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleting(material)}>
                <Trash2 aria-hidden />
                Delete
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>The PDF and the AI answers saved on its pages are deleted. Flashcards made from it stay.</AlertDialogDescription>
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
