import 'react-pdf/dist/Page/TextLayer.css'
import '@/lib/pdf'
import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { LoaderCircle, MessageSquareText } from 'lucide-react'
import { Document, Page } from 'react-pdf'
import type { Anchor } from './anchors'
import { cleanSelection, rectStyle, relativeRect, toPageRect, type PageRect } from './selection'

// One page of a PDF, drawn by pdf.js on this device, with a text layer so the student can select
// text. Saved AI Anchors are drawn as highlights with a pin at the spot they are about.

type TextContent = Parameters<NonNullable<ComponentProps<typeof Page>['onGetTextSuccess']>>[0]

export interface PageSelection {
  text: string
  rect: PageRect
}

interface PdfPageViewProps {
  file: Blob
  page: number
  zoom: number
  anchors: Anchor[]
  onDocumentLoad: (pageCount: number) => void
  onPageText: (text: string) => void
  onSelection: (selection: PageSelection | null) => void
  onOpenAnchor: (anchor: Anchor) => void
}

function textOf(content: TextContent): string {
  return content.items
    .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
    .join('')
    .trim()
}

export function PdfPageView({ file, page, zoom, anchors, onDocumentLoad, onPageText, onSelection, onOpenAnchor }: PdfPageViewProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  // The page is as wide as the screen allows, times the zoom. Measured right away, then on resize.
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    setWidth(Math.floor(frame.clientWidth))
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry?.contentRect.width ?? 0)))
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  // Follows the student's text selection on this page.
  useEffect(() => {
    function update() {
      const container = pageRef.current
      const selection = window.getSelection()
      if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) return onSelection(null)
      const range = selection.getRangeAt(0)
      if (!container.contains(range.commonAncestorContainer)) return onSelection(null)
      const text = cleanSelection(selection.toString())
      const rect = relativeRect(range.getBoundingClientRect(), container.getBoundingClientRect())
      onSelection(text && rect ? { text, rect } : null)
    }
    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [onSelection])

  return (
    <div ref={frameRef} className="w-full overflow-x-auto rounded-lg bg-muted/40">
      {width > 0 && (
        <Document
          file={file}
          onLoadSuccess={(document) => onDocumentLoad(document.numPages)}
          loading={<Waiting text="Opening the PDF…" />}
          error={<p className="p-4 text-sm text-destructive">This PDF could not be opened.</p>}
        >
          <div ref={pageRef} className="relative mx-auto w-fit">
            <Page
              pageNumber={page}
              width={Math.round(width * zoom)}
              renderAnnotationLayer={false}
              onGetTextSuccess={(content) => onPageText(textOf(content))}
              loading={<Waiting text={`Drawing page ${page}…`} />}
            />
            {anchors.map((anchor) => {
              const rect = toPageRect(anchor.rect)
              if (!rect) return null
              const style = rectStyle(rect)
              return (
                <div key={anchor.id}>
                  <div className="pointer-events-none absolute rounded-sm bg-mode-hustle/25" style={style} />
                  <button
                    type="button"
                    aria-label={`Open the saved answer about "${anchor.selected_text?.slice(0, 40) ?? ''}"`}
                    className="absolute z-10 flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow"
                    style={{ left: `calc(${style.left} + ${style.width})`, top: style.top }}
                    onClick={() => onOpenAnchor(anchor)}
                  >
                    <MessageSquareText className="size-3.5" aria-hidden />
                  </button>
                </div>
              )
            })}
          </div>
        </Document>
      )}
    </div>
  )
}

function Waiting({ text }: { text: string }) {
  return (
    <p className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      {text}
    </p>
  )
}
