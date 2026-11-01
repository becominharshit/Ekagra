import { MAX_FILE_BYTES, SourceFileSchema, type SourceFile } from '@shared/schemas.ts'

// Reading a file the student picked (a photo or a PDF) so it can be sent to the AI.

const TYPES = SourceFileSchema.shape.mimeType.options

export function isSupportedFile(file: File): file is File & { type: SourceFile['mimeType'] } {
  return (TYPES as readonly string[]).includes(file.type)
}

/** The file as base64 text for the AI. Throws a plain-language error if it can't be sent. */
export async function fileToSource(file: File): Promise<SourceFile> {
  if (!isSupportedFile(file)) throw new Error('Use a PDF, or a JPG, PNG or WebP photo.')
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_FILE_BYTES / 1024 / 1024} MB.`)
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("Couldn't read that file. Please try again."))
    reader.readAsDataURL(file)
  })
  return { mimeType: file.type, base64: dataUrl.slice(dataUrl.indexOf(',') + 1) }
}
