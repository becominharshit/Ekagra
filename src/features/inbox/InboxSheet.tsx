import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Camera, ExternalLink, FileUp, LoaderCircle, Sparkles, X } from 'lucide-react'
import { useNavigate } from 'react-router'
import { INBOX_KINDS, type InboxKind } from '@shared/schemas.ts'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { handOverImport } from '@/features/academics/importHandoff'
import { academicsKey, listSubjects, useSubjects, type Subject } from '@/features/academics/subjects'
import { useAuthStore } from '@/features/auth/authStore'
import { openStudioPage } from '@/features/bridge/studio'
import { materialPath, type Material } from '@/features/materials/materials'
import { useCaptureStore } from '@/features/tasks/captureStore'
import { need, useDataSource } from '@/lib/dataSource'
import { cn } from '@/lib/utils'
import { analyseUpload, readUpload, saveStudyMaterial, saveTimetable, subjectFor, typedItem, useInboxAction, type InboxItem, type InboxSuggestion } from './inbox'
import { useInboxStore } from './inboxStore'
import { classTimeLabel, newCourses } from './timetable'

const KIND_LABEL: Record<InboxKind, string> = {
  syllabus: 'Syllabus',
  timetable: 'Timetable',
  past_paper: 'Past paper',
  study_material: 'Study material (notes, slides, a chapter)',
  task: 'Task or notice',
  other: 'Something else',
}

/** For a guess made on the device: "Looks like …". */
const KIND_PHRASE: Record<InboxKind, string> = {
  syllabus: 'a syllabus',
  timetable: 'a timetable',
  past_paper: 'a past paper',
  study_material: 'study material',
  task: 'a task or notice',
  other: 'something else',
}

/** Subject choices besides the student's subjects. */
const NEW = '__new__'
const NONE = '__none__'

const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback)

/** The Add sheet: add a file, a photo or text; Ekagra says what it is; the student confirms where it goes. */
export function InboxSheet() {
  const open = useInboxStore((state) => state.open)
  const close = useInboxStore((state) => state.close)
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        {/* The flow only exists while the sheet is open, so it starts fresh every time. */}
        {open && <InboxFlow onDone={close} />}
      </DialogContent>
    </Dialog>
  )
}

type Stage =
  | { name: 'pick' }
  | { name: 'reading'; what: string }
  | { name: 'confirm'; item: InboxItem; suggestion: InboxSuggestion }
  | { name: 'done'; title: string; message: string; material: Material | null }

function InboxFlow({ onDone }: { onDone: () => void }) {
  const isDemo = useAuthStore((state) => state.status === 'demo')
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  // A file dropped onto the app window starts right away.
  const [dropped] = useState(() => useInboxStore.getState().file)
  const [stage, setStage] = useState<Stage>(() => (dropped ? { name: 'reading', what: dropped.name } : { name: 'pick' }))
  const [problem, setProblem] = useState<string | null>(null)
  const started = useRef(false)

  const begin = useCallback(
    async (read: () => Promise<InboxItem> | InboxItem, what: string) => {
      setProblem(null)
      setStage({ name: 'reading', what })
      try {
        const item = await read()
        const current = need(source)
        // The AI matches it to the student's subjects, so they must be loaded first.
        const subjects = await queryClient.ensureQueryData({ queryKey: [...academicsKey(owner), 'subjects'], queryFn: () => listSubjects(current) })
        setStage({ name: 'confirm', item, suggestion: await analyseUpload(current, item, subjects) })
      } catch (error) {
        setProblem(errorText(error, "That couldn't be read. Please try again."))
        setStage({ name: 'pick' })
      }
    },
    [source, owner, queryClient],
  )

  useEffect(() => {
    // Once, even when React runs effects twice in development or `begin` changes.
    if (!dropped || started.current) return
    started.current = true
    void begin(() => readUpload(dropped), dropped.name)
  }, [begin, dropped])

  if (stage.name === 'reading') {
    return (
      <div className="grid place-items-center gap-3 py-10 text-center">
        <DialogTitle className="sr-only">Reading</DialogTitle>
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-hidden />
        <p className="font-medium">Reading {stage.what}…</p>
        <p className="text-sm text-muted-foreground">
          {isDemo ? 'Looking at its name and words on this device.' : 'The AI is working out what it is. This takes a few seconds.'}
        </p>
      </div>
    )
  }
  if (stage.name === 'confirm') {
    return (
      <Confirm
        item={stage.item}
        suggestion={stage.suggestion}
        onBack={() => setStage({ name: 'pick' })}
        onClose={onDone}
        onSaved={(title, message, material) => setStage({ name: 'done', title, message, material })}
      />
    )
  }
  if (stage.name === 'done') {
    return <Done stage={stage} onAnother={() => setStage({ name: 'pick' })} onClose={onDone} />
  }
  return <Pick problem={problem} onFile={(file) => void begin(() => readUpload(file), file.name)} onText={(text) => void begin(() => typedItem(text), 'your text')} />
}

function Pick({ problem, onFile, onText }: { problem: string | null; onFile: (file: File) => void; onText: (text: string) => void }) {
  const [text, setText] = useState('')
  const [over, setOver] = useState(false)
  const camera = useRef<HTMLInputElement>(null)

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onFile(file)
  }

  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setOver(false)
    const file = event.dataTransfer.files[0]
    if (file) onFile(file)
  }

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Add to Ekagra</DialogTitle>
        <DialogDescription>
          A syllabus, timetable, past paper, notes or a notice. Ekagra works out what it is and where it goes, and you check before anything is
          saved.
        </DialogDescription>
      </DialogHeader>

      <label
        data-over={over}
        className="grid cursor-pointer place-items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors hover:bg-muted/50 data-[over=true]:border-mode-study data-[over=true]:bg-mode-study/5"
        onDragOver={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
      >
        <FileUp className="size-6 text-muted-foreground" aria-hidden />
        <span className="font-medium">Choose a file, or drop it here</span>
        <span className="text-xs text-muted-foreground">A PDF or a photo (JPG, PNG, WebP)</span>
        <input type="file" accept="application/pdf,image/*" className="sr-only" aria-label="File to add" onChange={pick} />
      </label>

      <Button variant="outline" className="lg:hidden" onClick={() => camera.current?.click()}>
        <Camera aria-hidden />
        Take a photo
      </Button>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Photo to add" onChange={pick} />

      <div className="grid gap-2">
        <Label htmlFor="inbox-text">Or paste text</Label>
        <Textarea
          id="inbox-text"
          rows={4}
          placeholder="A syllabus, a timetable, notes or a WhatsApp notice"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      <DialogFooter>
        <Button disabled={!text.trim()} onClick={() => onText(text)}>
          <Sparkles aria-hidden />
          Next
        </Button>
      </DialogFooter>
    </div>
  )
}

interface ConfirmProps {
  item: InboxItem
  suggestion: InboxSuggestion
  onBack: () => void
  onClose: () => void
  onSaved: (title: string, message: string, material: Material | null) => void
}

function Confirm({ item, suggestion, onBack, onClose, onSaved }: ConfirmProps) {
  const navigate = useNavigate()
  const isDemo = useAuthStore((state) => state.status === 'demo')
  const subjects = useSubjects().data ?? []
  const openCapture = useCaptureStore((state) => state.openWith)

  const [kind, setKind] = useState<InboxKind>(suggestion.kind)
  const [choice, setChoice] = useState(suggestion.subjectId ?? (suggestion.newSubject ? NEW : ''))
  const [newName, setNewName] = useState(suggestion.newSubject ?? '')
  const [title, setTitle] = useState(suggestion.title)
  const [classes, setClasses] = useState(suggestion.classes)
  const [addCourses, setAddCourses] = useState(false)

  const importTo = useInboxAction(subjectFor)
  const material = useInboxAction(saveStudyMaterial)
  const timetable = useInboxAction(saveTimetable)
  const busy = importTo.isPending || material.isPending || timetable.isPending
  const error = importTo.error ?? material.error ?? timetable.error

  const needsSubject = kind === 'syllabus' || kind === 'past_paper'
  const subjectId = choice && choice !== NEW && choice !== NONE ? choice : null
  const subjectReady = choice === NEW ? newName.trim().length > 0 : needsSubject ? subjectId !== null : true
  const courses = newCourses(classes)
  const subjectName = subjectId ? subjects.find((subject) => subject.id === subjectId)?.name : choice === NEW ? newName.trim() : null

  function importIt(which: 'syllabus' | 'past_paper') {
    importTo.mutate(
      { subjectId, newName: choice === NEW ? newName : null },
      {
        onSuccess: (id) => {
          if (!id) return
          handOverImport({ subjectId: id, kind: which, source: item.source, year: which === 'past_paper' ? suggestion.year : null })
          onClose()
          navigate(`/academics/subjects/${id}/${which === 'syllabus' ? 'import' : 'papers'}`)
        },
      },
    )
  }

  function saveMaterial() {
    material.mutate(
      { item, subjectId, newName: choice === NEW ? newName : null, title },
      {
        onSuccess: (saved) => {
          const where = `“${saved.title}” is in your Library${subjectName ? `, under ${subjectName}` : ''}`
          const message =
            saved.kind === 'pdf'
              ? `${where}.`
              : isDemo
                ? `${where}, on this device. Ekagra Studio needs sign-in, so it can't see Demo Mode's files.`
                : `${where}. Ekagra Studio can make notes, mind maps and quizzes from it.`
          onSaved('Saved', message, saved)
        },
      },
    )
  }

  function saveClasses() {
    timetable.mutate(
      { classes, addCourses: addCourses ? courses : [] },
      {
        onSuccess: (count) =>
          onSaved('Class times saved', `${count === 1 ? '1 class time is' : `${count} class times are`} in your routine. Today plans around them, and attendance asks about them.`, null),
      },
    )
  }

  function makeTasks() {
    // Demo Mode reads typed text only, so a photo or scan isn't handed over there.
    const file = !isDemo && item.source.file ? { source: item.source.file, name: item.name ?? 'photo.jpg' } : null
    onClose()
    openCapture({ text: item.source.text.slice(0, 8000), file })
  }

  function changeKind(next: string) {
    const picked = INBOX_KINDS.find((option) => option === next) ?? 'other'
    setKind(picked)
    // A syllabus or past paper needs a subject: "No subject" doesn't carry over.
    if ((picked === 'syllabus' || picked === 'past_paper') && choice === NONE) setChoice('')
  }

  function routineByHand() {
    onClose()
    navigate('/onboarding?step=routine')
  }

  const primary = (() => {
    if (kind === 'syllabus') return { label: 'Import the syllabus', run: () => importIt('syllabus'), ready: subjectReady }
    if (kind === 'past_paper') return { label: 'Add the past paper', run: () => importIt('past_paper'), ready: subjectReady }
    if (kind === 'study_material') return { label: 'Save to materials', run: saveMaterial, ready: subjectReady && title.trim().length > 0 }
    if (kind === 'task') return { label: 'Make tasks from it', run: makeTasks, ready: true }
    if (kind === 'timetable') return classes.length > 0 ? { label: 'Save my class times', run: saveClasses, ready: true } : { label: 'Add class times myself', run: routineByHand, ready: true }
    return { label: 'Choose what it is', run: () => undefined, ready: false }
  })()

  const hint = {
    syllabus: 'Opens Import syllabus for this subject with it filled in. The AI then makes the roadmap for you to check.',
    past_paper: `Opens Past papers for this subject with it filled in${suggestion.year ? ` (${suggestion.year})` : ''}. Its questions are matched to the subject's topics.`,
    study_material: item.kind === 'pdf' ? 'The PDF goes into your Library.' : 'It goes into your Library, saved privately in your account, where Ekagra Studio can use it too.',
    task:
      isDemo && item.kind === 'photo'
        ? "Opens Capture tasks. Demo Mode can't read photos, so type the task there."
        : 'Opens Capture tasks with it filled in, so you can check each task and its deadline.',
    timetable: null,
    other: 'Pick what it is above to file it.',
  }[kind]

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{suggestion.guessed ? `Looks like ${KIND_PHRASE[suggestion.kind]}` : suggestion.title}</DialogTitle>
        <DialogDescription>
          {suggestion.guessed
            ? isDemo
              ? "Guessed on this device from its name and words (Demo Mode has no AI). Change anything that's wrong."
              : "The AI couldn't read this, so this is a guess from its name. Change anything that's wrong."
            : (suggestion.summary ?? 'Check where it goes.')}
        </DialogDescription>
      </DialogHeader>
      {item.name && (
        <p className="-mt-2 truncate text-xs text-muted-foreground">
          {item.name}
          {item.pageCount ? ` · ${item.pageCount === 1 ? '1 page' : `${item.pageCount} pages`}` : ''}
        </p>
      )}

      <div className="grid gap-2">
        <Label htmlFor="inbox-kind">What is it?</Label>
        <Select value={kind} onValueChange={changeKind}>
          <SelectTrigger id="inbox-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INBOX_KINDS.map((option) => (
              <SelectItem key={option} value={option}>
                {KIND_LABEL[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(kind === 'syllabus' || kind === 'past_paper' || kind === 'study_material') && (
        <SubjectField subjects={subjects} value={choice} onChange={setChoice} newName={newName} onNewName={setNewName} optional={kind === 'study_material'} />
      )}
      {kind === 'study_material' && (
        <div className="grid gap-2">
          <Label htmlFor="inbox-title">Name</Label>
          <Input id="inbox-title" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
        </div>
      )}

      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}

      {kind === 'timetable' &&
        (classes.length === 0 ? (
          <p className="text-sm">
            {isDemo ? "Demo Mode can't read timetables (that needs the AI)." : 'No class times could be read from this.'} Add them yourself in your
            routine.
          </p>
        ) : (
          <div className="grid gap-3">
            <ul className="grid divide-y rounded-lg border">
              {classes.map((entry, index) => (
                <li key={`${entry.subject}-${entry.start}-${index}`} className="flex items-center gap-3 px-3 py-2">
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-sm font-medium">{entry.subject}</span>
                    <span className="text-xs text-muted-foreground">{classTimeLabel(entry)}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Leave out ${entry.subject}, ${classTimeLabel(entry)}`}
                    onClick={() => setClasses(classes.filter((_, other) => other !== index))}
                  >
                    <X aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
            {courses.length > 0 && (
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={addCourses} onCheckedChange={(checked) => setAddCourses(checked === true)} className="mt-0.5" />
                <span>
                  Also add {courses.join(', ')} as {courses.length === 1 ? 'a subject' : 'subjects'}
                </span>
              </label>
            )}
            <p className="text-xs text-muted-foreground">This replaces the class times in your routine. Sleep, meals and the rest stay as they are.</p>
          </div>
        ))}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
      {/* Stays at the bottom while a long timetable scrolls. */}
      <DialogFooter className="sticky bottom-0 bg-popover">
        <Button variant="outline" disabled={busy} onClick={onBack}>
          Back
        </Button>
        <Button disabled={!primary.ready || busy} onClick={primary.run}>
          {busy && <LoaderCircle className="animate-spin" aria-hidden />}
          {primary.label}
        </Button>
      </DialogFooter>
    </div>
  )
}

interface SubjectFieldProps {
  subjects: Subject[]
  value: string
  onChange: (value: string) => void
  newName: string
  onNewName: (value: string) => void
  /** Study material may have no subject. */
  optional: boolean
}

function SubjectField({ subjects, value, onChange, newName, onNewName, optional }: SubjectFieldProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="inbox-subject">Subject</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="inbox-subject" className={cn(!value && 'text-muted-foreground')}>
          <SelectValue placeholder="Choose a subject" />
        </SelectTrigger>
        <SelectContent>
          {subjects.map((subject) => (
            <SelectItem key={subject.id} value={subject.id}>
              {subject.name}
            </SelectItem>
          ))}
          <SelectItem value={NEW}>New subject…</SelectItem>
          {optional && <SelectItem value={NONE}>No subject</SelectItem>}
        </SelectContent>
      </Select>
      {value === NEW && <Input aria-label="New subject's name" placeholder="e.g. Engineering Physics" value={newName} maxLength={120} onChange={(event) => onNewName(event.target.value)} />}
    </div>
  )
}

function Done({ stage, onAnother, onClose }: { stage: Extract<Stage, { name: 'done' }>; onAnother: () => void; onClose: () => void }) {
  const navigate = useNavigate()
  const isDemo = useAuthStore((state) => state.status === 'demo')
  const material = stage.material
  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{stage.title}</DialogTitle>
        <DialogDescription>{stage.message}</DialogDescription>
      </DialogHeader>
      <DialogFooter className="flex-wrap">
        <Button variant="outline" onClick={onAnother}>
          Add another
        </Button>
        {material && (
          <Button
            variant="outline"
            onClick={() => {
              onClose()
              navigate(materialPath(material))
            }}
          >
            {material.kind === 'pdf' ? 'Open the PDF' : 'Open it'}
          </Button>
        )}
        {material && material.kind !== 'pdf' && !isDemo && (
          <Button variant="outline" onClick={() => void openStudioPage(`materials/${material.id}`)}>
            <ExternalLink aria-hidden />
            Open in Studio
          </Button>
        )}
        {!material && (
          <Button
            variant="outline"
            onClick={() => {
              onClose()
              navigate('/onboarding?step=routine')
            }}
          >
            Check my routine
          </Button>
        )}
        <Button onClick={onClose}>Done</Button>
      </DialogFooter>
    </div>
  )
}
