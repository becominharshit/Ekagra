import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Download, FileText, LoaderCircle, PenLine } from 'lucide-react'
import { Markdown } from '@/components/Markdown'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { exportNotePdf } from './exportNotePdf'
import { MindMap } from './MindMap'
import { parseOutline } from './outline'

// How a note is read: typed (the Markdown reader) or handwritten (the same words on ruled paper in
// Kalam), with a PDF of whichever view is showing. A mind map keeps its own flowchart view.
// Both apps use this, so a note looks the same in Ekagra and in Studio.

/** Long text reads better a little larger, with headings that stand out. */
const READING = 'text-base [&_h1]:text-xl [&_h2]:mt-6 [&_h2]:text-lg [&_h3]:mt-4'
const TYPED_EXPORT = 'text-[15px] leading-7 text-neutral-900 [&_h1]:text-2xl [&_h2]:mt-5 [&_h2]:text-xl [&_h3]:mt-4 [&_h3]:text-lg'
const HANDWRITTEN = [
  'font-hand text-[17px] leading-7 text-[#223a6b]',
  '[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-[#172b55]',
  '[&_h2]:mt-5 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-[#172b55] [&_h2]:underline [&_h2]:decoration-[#223a6b]/30 [&_h2]:underline-offset-4',
  '[&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-bold',
  '[&_strong]:font-bold [&_.katex]:text-[1.05em]',
  '[&_.katex-display]:my-3 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-1',
].join(' ')

const KIND_LABEL: Record<string, string> = { notes: 'Notes', mind_map: 'Mind map', revision_sheet: 'Revision sheet' }
const TYPE_NAME: Record<string, string> = { notes: 'notes', revision_sheet: 'revision sheet' }

/** The ruled paper with its red margin line, used on the page and in the PDF. */
function Paper({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('hand-paper relative overflow-hidden rounded-xl border border-amber-200/80 shadow-sm', className)}>
      <span aria-hidden className="absolute inset-y-0 left-10 w-px bg-red-300/60" />
      <div className="px-12 py-8">{children}</div>
    </div>
  )
}

export function NoteBody({ kind, title, content }: { kind: string; title: string; content: string }) {
  const [view, setView] = useState<'typed' | 'handwritten'>('typed')
  const [exporting, setExporting] = useState(false)
  const [exportRequest, setExportRequest] = useState<{ view: 'typed' | 'handwritten'; title: string; label: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const page = useRef<HTMLDivElement>(null)

  // The PDF page is mounted only while a PDF is being made, so reading a long note never draws it
  // twice. This effect runs after that page is on screen.
  useEffect(() => {
    if (!exportRequest || !page.current) return
    let cancelled = false
    const node = page.current
    exportNotePdf({ node, title: exportRequest.title, label: exportRequest.label })
      .catch((problem: unknown) => {
        console.error('Could not make the PDF:', problem)
        if (!cancelled) setError('The PDF could not be made. Please try again.')
      })
      .finally(() => {
        if (cancelled) return
        setExportRequest(null)
        setExporting(false)
      })
    return () => {
      cancelled = true
    }
  }, [exportRequest])

  if (kind === 'mind_map') return <MindMap root={parseOutline(content, title)} />
  if (content.trim() === '') return <p className="text-sm text-muted-foreground">This note is empty.</p>

  const handwritten = view === 'handwritten'
  const type = TYPE_NAME[kind] ?? 'notes'
  const label = `${KIND_LABEL[kind] ?? 'Note'} (${view})`

  function savePdf() {
    setExporting(true)
    setError(null)
    setExportRequest({ view, title: `${title} (${type}${handwritten ? ', handwritten' : ''})`, label })
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(next) => next && setView(next === 'handwritten' ? 'handwritten' : 'typed')}>
          <ToggleGroupItem value="typed">
            <FileText aria-hidden />
            Typed
          </ToggleGroupItem>
          <ToggleGroupItem value="handwritten">
            <PenLine aria-hidden />
            Handwritten
          </ToggleGroupItem>
        </ToggleGroup>
        <Button variant="outline" size="sm" disabled={exporting} onClick={savePdf}>
          {exporting ? <LoaderCircle className="animate-spin" aria-hidden /> : <Download aria-hidden />}
          PDF
        </Button>
        {error && (
          <span role="alert" className="text-xs text-destructive">
            {error}
          </span>
        )}
      </div>

      {handwritten ? (
        <Paper>
          <Markdown className={HANDWRITTEN}>{content}</Markdown>
        </Paper>
      ) : (
        <article className="max-w-3xl">
          <Markdown className={READING}>{content}</Markdown>
        </article>
      )}

      {/* The page a PDF is drawn from: A4 width, off-screen, only while it is being made. */}
      {exportRequest && (
        <div ref={page} aria-hidden className="pointer-events-none fixed top-0 -left-[10000px] w-[794px] bg-white p-12 text-black">
          {exportRequest.view === 'handwritten' ? (
            <Paper className="rounded-none border-0 shadow-none">
              <p className="mb-1 font-hand text-sm text-[#223a6b]/70">Ekagra · handwritten</p>
              <h1 className="mb-6 font-hand text-3xl font-bold text-[#172b55]">{title}</h1>
              <Markdown className={HANDWRITTEN}>{content}</Markdown>
            </Paper>
          ) : (
            <>
              <header className="mb-6 border-b border-neutral-300 pb-4">
                <p className="text-xs tracking-widest text-neutral-500 uppercase">Ekagra · {type}</p>
                <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
              </header>
              <Markdown className={TYPED_EXPORT}>{content}</Markdown>
            </>
          )}
        </div>
      )}
    </div>
  )
}
