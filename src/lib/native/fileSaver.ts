import { Capacitor, registerPlugin } from '@capacitor/core'

// Saving a file the app made (the data export). The Android app's WebView can't download files
// like a browser, so there our Kotlin plugin (android/app/src/main/java/app/ekagra/student/files/
// FileSaverPlugin.kt) opens Android's own "Save to" screen. On the web the browser downloads it.

interface FileSaverPlugin {
  save(options: { name: string; mimeType: string; data: string }): Promise<{ saved: boolean; uri?: string }>
}

const plugin = registerPlugin<FileSaverPlugin>('FileSaver')

/** Saves a text file. Returns false when the student closed Android's "Save to" screen without saving. */
export async function saveTextFile(name: string, mimeType: string, text: string): Promise<boolean> {
  if (Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('FileSaver')) {
    return (await plugin.save({ name, mimeType, data: text })).saved
  }
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  // The download has started; the file's temporary address can go a little later.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}
