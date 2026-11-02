import { useState } from 'react'
import { format } from 'date-fns'
import { ExternalLink, LoaderCircle, Trash2 } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { countLabel } from '@/features/academics/labels'
import { useAcademicsMutation, useSubjects } from '@/features/academics/subjects'
import { deleteMaterial } from '@/features/materials/materials'
import { BackLink } from '@studio/components/BackLink'
import { kindLabel } from '@studio/features/library/kinds'
import { moveMaterial, useLibrary, useMaterialFile, useMaterialText, type Material } from '@studio/features/library/library'
import { embedUrl, youtubeId } from '@studio/features/library/youtube'

const NONE = '__none__'

/** One material, shown by its kind, with what can be done with it. */
export function MaterialPage() {
  const { materialId } = useParams()
  const library = useLibrary()
  const material = library.data?.find((item) => item.id === materialId) ?? null

  if (library.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading…
      </p>
    )
  }
  if (!material) {
    return (
      <>
        <BackLink to="/" label="Library" />
        <p role="alert" className="text-sm text-destructive">
          {library.error?.message ?? 'This material was not found. It may have been deleted.'}
        </p>
      </>
    )
  }
  return <MaterialView key={material.id} material={material} />
}

function MaterialView({ material }: { material: Material }) {
  const navigate = useNavigate()
  const location = useLocation()
  const warning = (location.state as { warning?: string } | null)?.warning ?? null
  const subjects = useSubjects()
  const move = useAcademicsMutation(moveMaterial)
  const remove = useAcademicsMutation(deleteMaterial)
  const [deleting, setDeleting] = useState(false)
  const subjectName = subjects.data?.find((subject) => subject.id === material.subject_id)?.name ?? null
  const details = [
    kindLabel(material.kind),
    material.kind === 'pdf' && material.page_count ? countLabel(material.page_count, 'page') : null,
    `added ${format(new Date(material.created_at), 'd MMM yyyy')}`,
  ].filter(Boolean)

  return (
    <>
      <BackLink to={material.subject_id ? `/subjects/${material.subject_id}` : '/unfiled'} label={subjectName ?? 'No subject'} />
      <PageHeader title={material.title} subtitle={details.join(' · ')} />
      {warning && (
        <p role="status" className="-mt-2 mb-4 rounded-lg border border-mode-hustle/40 bg-mode-hustle/10 px-3 py-2 text-sm">
          {warning}
        </p>
      )}

      <div className="-mt-2 mb-5 flex flex-wrap items-center gap-2">
        <Select
          value={material.subject_id ?? NONE}
          onValueChange={(next) => move.mutate({ id: material.id, subjectId: next === NONE ? null : next })}
          disabled={move.isPending}
        >
          <SelectTrigger aria-label="Subject" size="sm" className="max-w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(subjects.data ?? []).map((subject) => (
              <SelectItem key={subject.id} value={subject.id}>
                {subject.name}
              </SelectItem>
            ))}
            <SelectItem value={NONE}>No subject</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleting(true)}>
          <Trash2 aria-hidden />
          Delete
        </Button>
      </div>
      {move.error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {move.error.message}
        </p>
      )}

      <Viewer material={material} />

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{material.title}”?</AlertDialogTitle>
            <AlertDialogDescription>It's deleted in Ekagra too. Notes made from it stay.</AlertDialogDescription>
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
                remove.mutate(material, { onSuccess: () => navigate(material.subject_id ? `/subjects/${material.subject_id}` : '/', { replace: true }) })
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

/** The material itself: the browser's PDF viewer, the photo, the text, or YouTube's player. */
function Viewer({ material }: { material: Material }) {
  const file = useMaterialFile(material)
  const text = useMaterialText(material)
  const box = 'rounded-xl border bg-card'

  if (material.kind === 'youtube') {
    const id = youtubeId(material.source_url ?? '')
    if (!id) return <p className="text-sm text-destructive">This video's link is broken. Delete it and add the video again.</p>
    return (
      <div className="grid gap-2">
        <iframe
          src={embedUrl(id)}
          title={material.title}
          className={`aspect-video w-full ${box}`}
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
        />
        <a href={material.source_url ?? '#'} target="_blank" rel="noreferrer" className="justify-self-start text-xs text-muted-foreground underline underline-offset-3 hover:text-foreground">
          Open on YouTube
        </a>
      </div>
    )
  }
  if (material.kind === 'text') {
    if (text.isPending) return <Loading />
    return <article className={`p-5 text-sm leading-relaxed whitespace-pre-wrap ${box}`}>{text.data || 'This text is empty.'}</article>
  }
  if (material.kind !== 'pdf' && material.kind !== 'image') return <p className="text-sm text-muted-foreground">Studio can't show this kind of material yet.</p>
  if (file.isPending) return <Loading />
  if (file.error) return <p className="text-sm text-destructive">{file.error.message}</p>
  if (!file.data) return <p className="text-sm text-destructive">This file is missing. Delete it and add it again.</p>
  if (material.kind === 'image') return <img src={file.data} alt={material.title} className={`mx-auto max-h-[78vh] object-contain ${box}`} />
  return (
    <div className="grid gap-2">
      {/* Phone browsers can't show a PDF inside a page; they open it instead. */}
      {navigator.pdfViewerEnabled && <iframe src={file.data} title={material.title} className={`h-[78vh] w-full ${box}`} />}
      <Button asChild variant={navigator.pdfViewerEnabled ? 'ghost' : 'default'} size="sm" className="justify-self-start">
        <a href={file.data} target="_blank" rel="noreferrer">
          <ExternalLink aria-hidden />
          {navigator.pdfViewerEnabled ? 'Open in a new tab' : 'Open the PDF'}
        </a>
      </Button>
    </div>
  )
}

function Loading() {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      Loading…
    </p>
  )
}
