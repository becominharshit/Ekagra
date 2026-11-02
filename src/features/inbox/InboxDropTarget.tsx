import { useEffect, useState } from 'react'
import { FileUp } from 'lucide-react'
import { useInboxStore } from './inboxStore'

const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')
/** A file input (it takes the drop itself) or an open dialog (the Add sheet has its own drop zone). */
const handledElsewhere = (event: DragEvent) =>
  (event.target instanceof HTMLInputElement && event.target.type === 'file') || document.querySelector('[role="dialog"]') !== null

/**
 * On a laptop or desktop: drag a file anywhere onto the app to add it (the Add sheet opens with it).
 * Without this, dropping a file would make the browser leave the app to show the file.
 */
export function InboxDropTarget() {
  const show = useInboxStore((state) => state.show)
  const [over, setOver] = useState(false)

  useEffect(() => {
    // dragenter and dragleave fire for every element the pointer crosses, so count them.
    let depth = 0
    const enter = (event: DragEvent) => {
      if (!hasFiles(event) || handledElsewhere(event)) return
      depth += 1
      setOver(true)
    }
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setOver(false)
    }
    const dragOver = (event: DragEvent) => {
      if (hasFiles(event) && !(event.target instanceof HTMLInputElement && event.target.type === 'file')) event.preventDefault()
    }
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return
      depth = 0
      setOver(false)
      if (event.target instanceof HTMLInputElement && event.target.type === 'file') return
      event.preventDefault()
      const file = event.dataTransfer?.files[0]
      if (file && !handledElsewhere(event)) show(file)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', dragOver)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', dragOver)
      window.removeEventListener('drop', drop)
    }
  }, [show])

  if (!over) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-background/80 p-6 backdrop-blur-sm">
      <div className="grid place-items-center gap-2 rounded-2xl border-2 border-dashed border-mode-study bg-background px-10 py-8 text-center">
        <FileUp className="size-7 text-mode-study" aria-hidden />
        <p className="font-heading text-lg font-semibold">Drop to add to Ekagra</p>
        <p className="text-sm text-muted-foreground">A syllabus, timetable, past paper, notes or a notice</p>
      </div>
    </div>
  )
}
