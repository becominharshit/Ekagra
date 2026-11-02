import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { pdfjs } from 'react-pdf'

// pdf.js reads PDFs on the device: nothing is uploaded to read a file's text.
// Import this file lazily (`await import('@/lib/pdf')`): pdf.js is big and most screens don't need it.

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export { pdfjs }

/** How many pages a PDF has. Throws a plain-language error if it isn't a readable PDF. */
export async function pdfPageCount(data: ArrayBuffer): Promise<number> {
  const task = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) })
  try {
    return (await task.promise).numPages
  } catch {
    throw new Error("That file couldn't be opened as a PDF.")
  } finally {
    await task.destroy()
  }
}

/** The text of each page (up to `maxPages`, from `firstPage` on), read on this device. */
export async function readPdfText(data: ArrayBuffer, maxPages = 80, firstPage = 1): Promise<{ pages: string[]; pageCount: number }> {
  // pdf.js takes over the buffer it is given, so it gets a copy and the caller keeps the original.
  const task = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) })
  const document = await task.promise
  try {
    const pages: string[] = []
    const start = Math.max(1, Math.floor(firstPage))
    for (let number = start; number <= Math.min(document.numPages, start + maxPages - 1); number++) {
      const page = await document.getPage(number)
      const content = await page.getTextContent()
      pages.push(
        content.items
          .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
          .join('')
          .replace(/[ \t]+\n/g, '\n')
          .trim(),
      )
    }
    return { pages, pageCount: document.numPages }
  } finally {
    await task.destroy()
  }
}
