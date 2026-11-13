import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Camera, FileUp, LoaderCircle, SquarePlay, Type } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useAcademicsMutation, useSubjects } from '@/features/academics/subjects'
import { addMaterial } from './library'

const NONE = '__none__'
type How = 'file' | 'youtube' | 'text'

/** Add a PDF, a photo, a YouTube lecture or text to the library, optionally under a subject. */
export function AddMaterialDialog({ open, onOpenChange, subjectId }: { open: boolean; onOpenChange: (open: boolean) => void; subjectId: string | null }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">{open && <AddFlow initialSubject={subjectId} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  )
}

function AddFlow({ initialSubject, onDone }: { initialSubject: string | null; onDone: () => void }) {
  const navigate = useNavigate()
  const subjects = useSubjects()
  const add = useAcademicsMutation(addMaterial)
  const [how, setHow] = useState<How>('file')
  const [subject, setSubject] = useState(initialSubject ?? NONE)
  const [link, setLink] = useState('')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const camera = useRef<HTMLInputElement>(null)
  const subjectId = subject === NONE ? null : subject

  function switchTab(next: How) {
    setError(null)
    add.reset()
    setHow(next)
  }

  function save(input: Parameters<typeof addMaterial>[1]) {
    setError(null)
    add.mutate(input, {
      onSuccess: ({ material, warning }) => {
        onDone()
        navigate(`/materials/${material.id}`, { state: warning ? { warning } : null })
      },
      onError: (caught) => {
        setError(caught instanceof Error ? caught.message : 'Could not add material.')
      },
    })
  }

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) save({ how: 'file', file, subjectId })
  }

  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setOver(false)
    const file = event.dataTransfer.files[0]
    if (file) save({ how: 'file', file, subjectId })
  }

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Add to your library</DialogTitle>
        <DialogDescription>A PDF, a photo of your notes, a YouTube lecture or text. Ekagra sees it too.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor="add-subject">Subject</Label>
        <Select value={subject} onValueChange={setSubject}>
          <SelectTrigger id="add-subject">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(subjects.data ?? []).map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
            <SelectItem value={NONE}>No subject</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ToggleGroup
        type="single"
        variant="outline"
        value={how}
        onValueChange={(next) => {
          if (!next) return
          switchTab(next === 'youtube' || next === 'text' ? next : 'file')
        }}
        aria-label="What to add"
      >
        <ToggleGroupItem value="file">
          <FileUp aria-hidden />
          File or photo
        </ToggleGroupItem>
        <ToggleGroupItem value="youtube">
          <SquarePlay aria-hidden />
          YouTube
        </ToggleGroupItem>
        <ToggleGroupItem value="text">
          <Type aria-hidden />
          Text
        </ToggleGroupItem>
      </ToggleGroup>

      {how === 'file' && (
        <>
          <label
            data-over={over}
            aria-disabled={add.isPending}
            className="grid cursor-pointer place-items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors hover:bg-muted/50 aria-disabled:pointer-events-none aria-disabled:opacity-60 data-[over=true]:border-studio data-[over=true]:bg-studio/5"
            onDragOver={(event) => {
              event.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={drop}
          >
            {add.isPending ? <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-hidden /> : <FileUp className="size-6 text-muted-foreground" aria-hidden />}
            <span className="font-medium">{add.isPending ? 'Adding…' : 'Choose a file, or drop it here'}</span>
            <span className="text-xs text-muted-foreground">A PDF (up to 50 MB) or a photo</span>
            <input type="file" accept="application/pdf,image/*" className="sr-only" aria-label="File to add" disabled={add.isPending} onChange={pick} />
          </label>
          <Button variant="outline" className="lg:hidden" disabled={add.isPending} onClick={() => camera.current?.click()}>
            <Camera aria-hidden />
            Take a photo
          </Button>
          <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Photo to add" onChange={pick} />
        </>
      )}

      {how === 'youtube' && (
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="add-link">Link to the video</Label>
            <Input
              id="add-link"
              inputMode="url"
              placeholder="https://www.youtube.com/watch?v=…"
              value={link}
              onChange={(event) => {
                setError(null)
                setLink(event.target.value)
              }}
            />
            <p className="text-xs text-muted-foreground">Public videos only. Studio makes notes from the video itself; you never paste a transcript.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="add-video-title">Name (optional)</Label>
            <Input id="add-video-title" placeholder="YouTube's title is used if you leave this empty" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
          </div>
        </div>
      )}

      {how === 'text' && (
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="add-text-title">Name</Label>
            <Input id="add-text-title" placeholder="e.g. Unit 2 notes" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="add-text">Text</Label>
            <Textarea id="add-text" rows={8} placeholder="Paste or type your notes" value={text} onChange={(event) => setText(event.target.value)} />
          </div>
        </div>
      )}

      {(error ?? add.error?.message) && (
        <p role="alert" className="text-sm text-destructive">
          {error ?? add.error?.message}
        </p>
      )}

      {how !== 'file' && (
        <DialogFooter>
          <Button
            disabled={add.isPending || (how === 'youtube' ? !link.trim() : !text.trim() || !title.trim())}
            onClick={() => save(how === 'youtube' ? { how, link, title, subjectId } : { how: 'text', text, title, subjectId })}
          >
            {add.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
            {how === 'youtube' ? 'Add the video' : 'Save the text'}
          </Button>
        </DialogFooter>
      )}
    </div>
  )
}
