import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { pdfjs } from 'react-pdf'

// pdf.js reads PDFs on the device: nothing is uploaded to read a file's text.
// Import this file lazily (`await import('@/lib/pdf')`): pdf.js is big and most screens don't need it.

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export { pdfjs }

/** The text of each page (up to `maxPages`), read on this device. */
export async function readPdfText(data: ArrayBuffer, maxPages = 80): Promise<{ pages: string[]; pageCount: number }> {
  // pdf.js takes over the buffer it is given, so it gets a copy and the caller keeps the original.
  const task = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) })
  const document = await task.promise
  try {
    const pages: string[] = []
    for (let number = 1; number <= Math.min(document.numPages, maxPages); number++) {
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
