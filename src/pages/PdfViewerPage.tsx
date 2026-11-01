import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, LoaderCircle, MessageCircleQuestion, ZoomIn, ZoomOut } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router'
import type { AnchorAction } from '@shared/schemas.ts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAcademicsMutation, useSubjects } from '@/features/academics/subjects'
import { announceAnchor, announceAnchorDeleted } from '@/features/bridge/studio'
import { AnchorBar } from '@/features/materials/AnchorBar'
import { AnchorDialog, AskDialog } from '@/features/materials/AnchorDialogs'
import { ACTION_LABEL, createAnchor, deleteAnchor, useAnchors, type Anchor } from '@/features/materials/anchors'
import { useMaterial, usePdfFile, type Material } from '@/features/materials/materials'
import { PdfPageView, type PageSelection } from '@/features/materials/PdfPageView'
import { useProfile } from '@/features/profile/queries'
import { toMentorTone } from '@/features/profile/settings'

const ZOOMS = [1, 1.25, 1.5, 2]
const lastPageKey = (materialId: string) => `ekagra-pdf-page:${materialId}`

function savedPage(materialId: string | undefined): number {
  const page = Number(materialId ? localStorage.getItem(lastPageKey(materialId)) : 1)
  return Number.isInteger(page) && page >= 1 ? page : 1
}

/** The page to open: one in the link (?page=, e.g. from Ekagra Studio), else where the student left it. */
function startPage(material: Material, linked: string | null): number {
  const page = Number(linked)
  if (!Number.isInteger(page) || page < 1) return savedPage(material.id)
  return material.page_count ? Math.min(page, material.page_count) : page
}

/** A PDF from the library with 1-click AI Anchors and "Ask about this page". */
export function PdfViewerPage() {
  const { materialId } = useParams()
  const [params] = useSearchParams()
  const material = useMaterial(materialId)
  const file = usePdfFile(material.data)

  if (material.isPending || (material.data && file.isPending)) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading the PDF…
      </p>
    )
  }
  if (!material.data || !file.data) {
    return (
      <div className="grid gap-3">
        <p role="alert" className="text-sm text-destructive">
          {file.error?.message ?? material.error?.message ?? 'This PDF was not found.'}
        </p>
        <Button asChild variant="outline" className="justify-self-start">
          <Link to="/academics/library">Back to the library</Link>
        </Button>
      </div>
    )
  }
  // A new link (another page or anchor) starts the viewer afresh.
  return <Viewer key={params.toString()} material={material.data} file={file.data} linkedPage={params.get('page')} linkedAnchor={params.get('anchor')} />
}

function Viewer({ material, file, linkedPage, linkedAnchor }: { material: Material; file: Blob; linkedPage: string | null; linkedAnchor: string | null }) {
  const anchors = useAnchors(material.id)
  const subjects = useSubjects()
  const profile = useProfile()
  const create = useAcademicsMutation(createAnchor)
  const remove = useAcademicsMutation(deleteAnchor)

  const [page, setPage] = useState(() => startPage(material, linkedPage))
  // An anchor named in the link opens once it has loaded, until it's closed.
  const [linkedOpen, setLinkedOpen] = useState(linkedAnchor)
  const [pageCount, setPageCount] = useState<number | null>(material.page_count)
  const [pageText, setPageText] = useState('')
  const [zoom, setZoom] = useState(0)
  const [selection, setSelection] = useState<PageSelection | null>(null)
  const [opened, setOpened] = useState<{ anchor: Anchor; cardCount: number } | null>(null)
  const [asking, setAsking] = useState(false)

  const lastPage = pageCount ?? material.page_count ?? 1
  const onPageAnchors = (anchors.data ?? []).filter((anchor) => anchor.page_no === page)
  const linked = linkedOpen ? ((anchors.data ?? []).find((anchor) => anchor.id === linkedOpen) ?? null) : null
  const shown = opened ?? (linked ? { anchor: linked, cardCount: 0 } : null)
  const closeAnchor = () => {
    setOpened(null)
    setLinkedOpen(null)
  }
  const subjectName = subjects.data?.find((subject) => subject.id === material.subject_id)?.name ?? null
  const handleSelection = useCallback((next: PageSelection | null) => setSelection(next), [])

  // The next visit opens the PDF where the student left it.
  useEffect(() => {
    localStorage.setItem(lastPageKey(material.id), String(page))
  }, [material.id, page])

  function goTo(next: number) {
    setPage(Math.min(Math.max(1, Math.round(next) || 1), lastPage))
    setSelection(null)
  }

  function run(action: AnchorAction, question?: string) {
    create.mutate(
      {
        material,
        rect: selection?.rect ?? null,
        request: {
          action,
          selectedText: selection?.text ?? null,
          question: question ?? null,
          pageText: pageText.slice(0, 20_000),
          pageNumber: page,
          materialTitle: material.title,
          subjectName,
          program: profile.data?.program ?? null,
          year: profile.data?.year ?? null,
          mentorTone: toMentorTone(profile.data?.mentor_tone),
        },
      },
      {
        onSuccess: (created) => {
          setAsking(false)
          setSelection(null)
          window.getSelection()?.removeAllRanges()
          setOpened(created)
          announceAnchor(created.anchor, material.title)
        },
      },
    )
  }

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link to={material.subject_id ? `/academics/library?subject=${material.subject_id}` : '/academics/library'}>
          <ArrowLeft aria-hidden />
          Library
        </Link>
      </Button>
      <h1 className="mb-3 font-heading text-xl font-semibold tracking-tight">{material.title}</h1>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Previous page" disabled={page <= 1} onClick={() => goTo(page - 1)}>
            <ChevronLeft aria-hidden />
          </Button>
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            Page
            <Input
              inputMode="numeric"
              aria-label="Page number"
              className="h-8 w-16 text-center"
              value={page}
              onChange={(event) => goTo(Number(event.target.value))}
            />
            of {lastPage}
          </label>
          <Button variant="outline" size="icon" aria-label="Next page" disabled={page >= lastPage} onClick={() => goTo(page + 1)}>
            <ChevronRight aria-hidden />
          </Button>
          <div className="ml-auto flex gap-1">
            <Button variant="ghost" size="icon" aria-label="Zoom out" disabled={zoom === 0} onClick={() => setZoom(zoom - 1)}>
              <ZoomOut aria-hidden />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Zoom in" disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom(zoom + 1)}>
              <ZoomIn aria-hidden />
            </Button>
          </div>
        </div>

        <PdfPageView
          file={file}
          page={page}
          zoom={ZOOMS[zoom] ?? 1}
          anchors={onPageAnchors}
          onDocumentLoad={setPageCount}
          onPageText={setPageText}
          onSelection={handleSelection}
          onOpenAnchor={(anchor) => setOpened({ anchor, cardCount: 0 })}
        />

        {create.error && !asking && (
          <p role="alert" className="text-sm text-destructive">
            {create.error.message}
          </p>
        )}

        {selection ? (
          <AnchorBar busy={create.isPending} onAction={(action) => (action === 'ask' ? setAsking(true) : run(action))} />
        ) : (
          <p className="text-sm text-muted-foreground">Select text on the page for 1-click AI help, or ask about the whole page.</p>
        )}
        <Button variant="outline" className="justify-self-start" onClick={() => setAsking(true)}>
          <MessageCircleQuestion aria-hidden />
          Ask about this page
        </Button>

        {onPageAnchors.length > 0 && (
          <Card size="sm">
            <CardHeader>
              <CardTitle>Saved on this page</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-1">
                {onPageAnchors.map((anchor) => (
                  <li key={anchor.id}>
                    <button
                      type="button"
                      className="w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                      onClick={() => setOpened({ anchor, cardCount: 0 })}
                    >
                      <span className="font-medium">{ACTION_LABEL[anchor.action as AnchorAction] ?? anchor.action}:</span>{' '}
                      <span className="text-muted-foreground">{anchor.question ?? anchor.selected_text ?? 'this page'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <AskDialog
        key={asking ? 'open' : 'closed'}
        open={asking}
        page={page}
        selectedText={selection?.text ?? null}
        busy={create.isPending}
        error={asking ? (create.error?.message ?? null) : null}
        onAsk={(question) => run('ask', question)}
        onClose={() => setAsking(false)}
      />
      <AnchorDialog
        key={shown?.anchor.id ?? 'none'}
        anchor={shown?.anchor ?? null}
        cardCount={shown?.cardCount ?? 0}
        materialTitle={material.title}
        deleting={remove.isPending}
        onDelete={(anchor) =>
          remove.mutate(anchor.id, {
            onSuccess: () => {
              closeAnchor()
              announceAnchorDeleted(anchor.id)
            },
          })
        }
        onClose={closeAnchor}
      />
    </>
  )
}
