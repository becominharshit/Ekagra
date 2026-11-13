import { format } from 'date-fns'
import { ArrowLeft, ExternalLink, LoaderCircle } from 'lucide-react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import { clockTime, embedUrl, watchUrl, youtubeId } from '@shared/youtube.ts'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useSubject } from '@/features/academics/subjects'
import { useAuthStore } from '@/features/auth/authStore'
import { openStudioPage } from '@/features/bridge/studio'
import { NoteIcon } from '@/features/materials/KindIcons'
import { materialSummary } from '@/features/materials/kinds'
import { materialPath, useMaterialFile, useMaterialText, useStudyMaterial, type Material } from '@/features/materials/materials'
import { noteKindLabel, useNotes } from '@/features/notes/notes'

/** A YouTube video, photo or text from the Library, with the notes Ekagra Studio made from it. PDFs open in the PDF viewer. */
export function MaterialPage() {
  const { materialId } = useParams()
  const material = useStudyMaterial(materialId)

  if (material.isPending) return <Loading />
  if (!material.data) {
    return (
      <div className="grid gap-3">
        <p role="alert" className="text-sm text-destructive">
          {material.error?.message ?? 'This was not found. It may have been deleted.'}
        </p>
        <Button asChild variant="outline" className="justify-self-start">
          <Link to="/academics/library">Back to the Library</Link>
        </Button>
      </div>
    )
  }
  if (material.data.kind === 'pdf') return <Navigate to={materialPath(material.data)} replace />
  return <MaterialView key={material.data.id} material={material.data} />
}

function MaterialView({ material }: { material: Material }) {
  const isDemo = useAuthStore((state) => state.status === 'demo')
  const subject = useSubject(material.subject_id ?? undefined)
  const notes = useNotes()
  const made = (notes.data ?? []).filter((note) => note.material_id === material.id)
  const details = [materialSummary(material), material.subject_id ? subject.data?.name : 'No subject', `added ${format(new Date(material.created_at), 'd MMM yyyy')}`]

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link to="/academics/library">
          <ArrowLeft aria-hidden />
          Library
        </Link>
      </Button>
      <PageHeader title={material.title} subtitle={details.filter(Boolean).join(' · ')} />
      {!isDemo && (
        <div className="-mt-2 mb-5">
          <Button variant="outline" size="sm" onClick={() => void openStudioPage(`materials/${material.id}`)}>
            <ExternalLink aria-hidden />
            Make notes in Studio
          </Button>
        </div>
      )}

      {made.length > 0 && (
        <section className="mb-5 grid gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Made from it in Ekagra Studio</h2>
          <Card size="sm">
            <CardContent>
              <ul className="grid">
                {made.map((note) => (
                  <li key={note.id}>
                    <Link to={`/academics/notes/${note.id}`} className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted">
                      <NoteIcon kind={note.kind} className="mt-0.5 size-4 shrink-0 text-mode-study" aria-hidden />
                      <span className="grid min-w-0 gap-0.5">
                        <span className="truncate font-medium">{note.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {noteKindLabel(note.kind)} · {format(new Date(note.updated_at), 'd MMM')}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      <Viewer material={material} />
    </>
  )
}

/** The material itself: YouTube's player, the photo or the text. */
function Viewer({ material }: { material: Material }) {
  const [params] = useSearchParams()
  const file = useMaterialFile(material)
  const text = useMaterialText(material)
  const box = 'rounded-xl border bg-card'

  if (material.kind === 'youtube') {
    const id = youtubeId(material.source_url ?? '')
    if (!id) return <p className="text-sm text-destructive">This video's link is broken. Delete it and add the video again in Ekagra Studio.</p>
    const rawStart = Number(params.get('t'))
    const startSec = Number.isFinite(rawStart) && rawStart > 0 ? Math.floor(rawStart) : undefined
    return (
      <div className="grid gap-2">
        {startSec !== undefined && (
          <p className="text-xs text-muted-foreground">Jumped to timestamp {clockTime(startSec)}</p>
        )}
        <iframe
          key={startSec ?? 'start'}
          src={embedUrl(id, startSec)}
          title={material.title}
          className={`aspect-video w-full ${box}`}
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
        />
        <Button asChild variant="ghost" size="sm" className="justify-self-start">
          <a href={startSec ? `${watchUrl(id)}&t=${startSec}s` : watchUrl(id)} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden />
            Open on YouTube
          </a>
        </Button>
      </div>
    )
  }
  if (material.kind === 'text') {
    if (text.isPending) return <Loading />
    if (text.error) return <p className="text-sm text-destructive">{text.error.message}</p>
    return <article className={`p-5 text-sm leading-relaxed whitespace-pre-wrap ${box}`}>{text.data || 'This text is empty.'}</article>
  }
  if (material.kind === 'image') {
    if (file.isPending) return <Loading />
    if (file.error) return <p className="text-sm text-destructive">{file.error.message}</p>
    if (!file.data) return <p className="text-sm text-destructive">This photo is missing. Delete it and add it again.</p>
    return <img src={file.data} alt={material.title} className={`mx-auto max-h-[75vh] object-contain ${box}`} />
  }
  return <p className="text-sm text-muted-foreground">Ekagra can't show this kind of material yet. Open it in Ekagra Studio.</p>
}

function Loading() {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      Loading…
    </p>
  )
}
