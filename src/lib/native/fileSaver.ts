import { Capacitor, registerPlugin } from '@capacitor/core'

// Saving a file the app made (the data export, a note's PDF). The Android app's WebView can't
// download files like a browser, so there our Kotlin plugin (android/app/src/main/java/app/ekagra/
// student/files/FileSaverPlugin.kt) opens Android's own "Save to" screen. On the web the browser
// downloads it. Text is sent as UTF-8; a PDF is sent as base64 and written byte for byte.

interface FileSaverPlugin {
  save(options: { name: string; mimeType: string; data: string; encoding?: 'utf8' | 'base64' }): Promise<{ saved: boolean; uri?: string }>
}

const plugin = registerPlugin<FileSaverPlugin>('FileSaver')

function download(name: string, mimeType: string, part: BlobPart, text = false): void {
  const url = URL.createObjectURL(new Blob([part], { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  // The download has started; the file's temporary address can go a little later.
  setTimeout(() => URL.revokeObjectURL(url), text ? 60_000 : 120_000)
}

function toBase64(bytes: Uint8Array): string {
  // Chunked: String.fromCharCode(...bytes) runs out of stack for a PDF of a few pages.
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  return btoa(binary)
}

async function saveFile(name: string, mimeType: string, payload: { text: string } | { bytes: Uint8Array }): Promise<boolean> {
  const binary = 'bytes' in payload
  if (Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('FileSaver')) {
    const data = 'bytes' in payload ? toBase64(payload.bytes) : payload.text
    return (await plugin.save({ name, mimeType, data, encoding: binary ? 'base64' : 'utf8' })).saved
  }
  download(name, mimeType, binary ? new Uint8Array(payload.bytes).buffer : payload.text, !binary)
  return true
}

/** Saves a text file. Returns false when the student closed Android's "Save to" screen without saving. */
export function saveTextFile(name: string, mimeType: string, text: string): Promise<boolean> {
  return saveFile(name, mimeType, { text })
}

/** Saves a binary file (a PDF). Returns false when the student closed Android's "Save to" screen without saving. */
export function saveBinaryFile(name: string, mimeType: string, bytes: Uint8Array): Promise<boolean> {
  return saveFile(name, mimeType, { bytes })
}
