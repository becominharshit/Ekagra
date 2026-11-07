import { saveBinaryFile } from '@/lib/native/fileSaver'
import { notePageSlices, notePdfName } from './pdfPages'

// A note as a PDF: the page (typed or handwritten) is drawn off-screen at A4 width, captured as one
// tall image, cut into A4 pages at blank rows so no line is sliced, and written by jsPDF. The PDF
// libraries load only when the student asks for one, so reading notes stays light.

const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297
const MARGIN_MM = 12
const CONTENT_WIDTH_MM = A4_WIDTH_MM - MARGIN_MM * 2
const CONTENT_HEIGHT_MM = A4_HEIGHT_MM - MARGIN_MM * 2
/** How many CSS pixels of the captured image fit on one A4 page (at the image's own scale). */
export const PAGE_HEIGHT_RATIO = CONTENT_HEIGHT_MM / CONTENT_WIDTH_MM

/** Whether a row of pixels is free of ink (sampling every 4th pixel is enough to tell text from paper). */
function blankRow(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, y: number): boolean {
  const row = ctx.getImageData(0, y, canvas.width, 1).data
  let ink = 0
  for (let x = 0; x < canvas.width; x += 4) {
    const at = x * 4
    if (row[at]! < 245 || row[at + 1]! < 245 || row[at + 2]! < 245) ink += 1
  }
  return ink <= 2
}

export interface NotePdfOptions {
  /** The off-screen page to draw (A4 width, white background). */
  node: HTMLElement
  title: string
  /** e.g. "Notes (handwritten)" */
  label: string
}

/** Makes the PDF and saves it. Returns false when the student closed Android's "Save to" screen. */
export async function exportNotePdf({ node, title, label }: NotePdfOptions): Promise<boolean> {
  const [{ jsPDF }, { domToCanvas }] = await Promise.all([import('jspdf'), import('modern-screenshot')])
  await document.fonts.ready
  // Let the page draw the view first. A hidden tab (the student switched tabs) never runs
  // requestAnimationFrame, so a short timer makes sure the export still goes ahead.
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 250)
    requestAnimationFrame(() => {
      clearTimeout(timer)
      resolve()
    })
  })

  // A long note is captured at 1.25× rather than 2× to stay inside the browser's canvas limit;
  // a very long one at 1×, because a canvas can be at most about 32,767 pixels tall.
  const scale = node.scrollHeight > 24_000 ? 1 : node.scrollHeight > 12_000 ? 1.25 : 2
  const canvas = await domToCanvas(node, { scale, backgroundColor: '#ffffff' })
  const ctx = canvas.getContext('2d')
  const pageHeight = Math.floor(canvas.width * PAGE_HEIGHT_RATIO)
  const slices = notePageSlices(canvas.height, pageHeight, ctx ? (y) => blankRow(canvas, ctx, y) : undefined)

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  pdf.setProperties({ title })
  slices.forEach((slice, index) => {
    if (index > 0) pdf.addPage()
    const page = document.createElement('canvas')
    page.width = canvas.width
    page.height = slice.height
    const pageCtx = page.getContext('2d')
    if (!pageCtx) throw new Error("The PDF couldn't be drawn.")
    pageCtx.fillStyle = '#ffffff'
    pageCtx.fillRect(0, 0, page.width, page.height)
    pageCtx.drawImage(canvas, 0, slice.start, canvas.width, slice.height, 0, 0, canvas.width, slice.height)
    const imageHeight = slice.height * (CONTENT_WIDTH_MM / canvas.width)
    pdf.addImage(page.toDataURL('image/jpeg', 0.93), 'JPEG', MARGIN_MM, MARGIN_MM, CONTENT_WIDTH_MM, imageHeight)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(130)
    pdf.text(label, MARGIN_MM, A4_HEIGHT_MM - 7)
    pdf.text(`${index + 1} / ${slices.length}`, A4_WIDTH_MM - MARGIN_MM, A4_HEIGHT_MM - 7, { align: 'right' })
  })

  return saveBinaryFile(notePdfName(title), 'application/pdf', new Uint8Array(pdf.output('arraybuffer')))
}
