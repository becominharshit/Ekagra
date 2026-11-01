import { MAX_FILE_BYTES, SourceFileSchema, type SourceFile } from '@shared/schemas.ts'

// Reading a file the student picked (a photo or a PDF) so it can be sent to the AI.

const TYPES = SourceFileSchema.shape.mimeType.options

export function isSupportedFile(file: File): file is File & { type: SourceFile['mimeType'] } {
  return (TYPES as readonly string[]).includes(file.type)
}

/** The size a photo is drawn at: the longest side at most `maxSide`, never made bigger. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height, 1))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/**
 * A photo made smaller on the device (longest side at most 1280 px, JPEG) before it goes to the
 * AI: a phone photo of 4 MB becomes about 200 KB, so it's quick on mobile data and cheaper.
 */
export async function shrinkPhoto(file: File, maxSide = 1280, quality = 0.8): Promise<SourceFile> {
  if (!file.type.startsWith('image/')) throw new Error('Use a photo (JPG, PNG or WebP).')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error("Couldn't open that photo. Try a JPG or PNG.")
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSide)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error("This device couldn't prepare the photo.")
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error("This device couldn't prepare the photo.")
  return fileToSource(new File([blob], 'photo.jpg', { type: 'image/jpeg' }))
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
