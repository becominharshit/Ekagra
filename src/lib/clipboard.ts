/** Copies text to the clipboard. Returns false if this device doesn't allow it. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Some Android WebViews refuse the clipboard API: try the old way, through a hidden text box.
    const box = document.createElement('textarea')
    box.value = text
    box.setAttribute('readonly', '')
    box.style.position = 'fixed'
    box.style.opacity = '0'
    document.body.append(box)
    box.select()
    try {
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      box.remove()
    }
  }
}
