import type { ModelMessage } from 'ai'
import type { SourceFile } from '../schemas.ts'

/**
 * The request plus the material it is about: plain text, or a file (a scanned PDF or a photo)
 * that the model reads itself. Text found in a file on the device is sent along as a hint.
 */
export function withSource(ask: string, text: string | undefined, file: SourceFile | undefined): string | ModelMessage[] {
  const material = text?.trim() ? `\n\n<<<\n${text.trim()}\n>>>` : ''
  if (!file) return `${ask}${material}`
  return [
    {
      role: 'user',
      content: [
        { type: 'text', text: material ? `${ask}\n\nText found in the file (it may be incomplete):${material}` : ask },
        { type: 'file', data: file.base64, mediaType: file.mimeType },
      ],
    },
  ]
}
