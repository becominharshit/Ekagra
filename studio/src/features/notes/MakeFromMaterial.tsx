import { useState } from 'react'
import { FileText, ListChecks, LoaderCircle, Network, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router'
import type { StudioNoteKind } from '@shared/schemas.ts'
import { clockTime, DEFAULT_WINDOW_SECONDS, videoWindows, type VideoPart } from '@shared/youtube.ts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAcademicsMutation } from '@/features/academics/subjects'
import { useProfile } from '@/features/profile/queries'
import type { Material } from '@studio/features/library/library'
import { NoteList } from '@studio/features/library/lists'
import { makeNotes } from './makeNotes'
import { useStudioNotes } from './studioNotes'

const OPTIONS: { kind: StudioNoteKind; label: string; about: string; icon: LucideIcon }[] = [
  { kind: 'notes', label: 'Notes', about: 'Full, detailed notes of everything, in order', icon: FileText },
  { kind: 'mind_map', label: 'Mind map', about: 'The big picture as a flowchart', icon: Network },
  { kind: 'revision_sheet', label: 'Revision sheet', about: 'Formulas and key facts on one page', icon: ListChecks },
]

const READS: Record<string, string> = {
  youtube:
    'Gemini watches the video: public videos of up to 12 hours. For lectures over 90 minutes, make notes in 90-minute parts (each takes about half a minute). Make the notes first: a mind map or revision sheet is then made from them in seconds.',
  pdf: "Gemini reads the PDF's text, about 25 to 40 pages at a time.",
  image: 'Gemini reads the photo.',
  text: 'Gemini reads your text.',
}

/** Default 90-minute parts shown before YouTube's duration is known, so marathon lectures can be sliced on the very first click. */
const UNKNOWN_DURATION_WINDOWS: VideoPart[] = [
  { start: 0, end: 5400 },
  { start: 5400, end: 10_800 },
  { start: 10_800, end: 16_200 },
  { start: 16_200, end: 21_600 },
]

/** On a material's page: make notes, a mind map or a revision sheet from it, and what was made before. */
export function MakeFromMaterial({ material }: { material: Material }) {
  const navigate = useNavigate()
  const profile = useProfile()
  const make = useAcademicsMutation(makeNotes)
  const made = useStudioNotes({ materialId: material.id })
  const [making, setMaking] = useState<StudioNoteKind | null>(null)
  const [firstPage, setFirstPage] = useState('1')
  const durationSec = material.duration_sec
  const knownWindows = material.kind === 'youtube' ? videoWindows(durationSec, DEFAULT_WINDOW_SECONDS) : []
  const windows = material.kind === 'youtube' && durationSec === null ? UNKNOWN_DURATION_WINDOWS : knownWindows
  const defaultStart = knownWindows.length > 0 ? '0' : ''
  const defaultEnd = knownWindows.length > 0 ? String(Math.ceil((knownWindows[0]?.end ?? DEFAULT_WINDOW_SECONDS) / 60)) : ''
  const [customStart, setStartMin] = useState<string | null>(null)
  const [customEnd, setEndMin] = useState<string | null>(null)
  const startMin = customStart ?? defaultStart
  const endMin = customEnd ?? defaultEnd
  const subjectId = material.subject_id

  function start(kind: StudioNoteKind) {
    if (!subjectId) return
    const parsedStart = startMin.trim() ? Number.parseInt(startMin, 10) : undefined
    const parsedEnd = endMin.trim() ? Number.parseInt(endMin, 10) : undefined
    const startSec = parsedStart !== undefined && !Number.isNaN(parsedStart) && parsedStart > 0 ? parsedStart * 60 : undefined
    const endSec = parsedEnd !== undefined && !Number.isNaN(parsedEnd) && parsedEnd > 0 ? parsedEnd * 60 : undefined
    setMaking(kind)
    make.mutate(
      {
        material,
        kind,
        subjectId,
        firstPage: Math.max(1, Number.parseInt(firstPage, 10) || 1),
        startSec: startSec !== undefined || endSec !== undefined ? (startSec ?? 0) : undefined,
        endSec,
        program: profile.data?.program,
        year: profile.data?.year,
      },
      { onSuccess: (noteId) => navigate(`/notes/${noteId}`), onSettled: () => setMaking(null) },
    )
  }

  return (
    <section className="mb-6 grid gap-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="font-heading font-medium">Make from this</h2>
        <p className="text-sm text-muted-foreground">{READS[material.kind] ?? 'Gemini reads it.'}</p>
      </div>
      {subjectId ? (
        <div className="grid gap-2 sm:grid-cols-3">
          {OPTIONS.map(({ kind, label, about, icon: Icon }) => (
            <Button key={kind} variant="outline" className="h-auto justify-start gap-3 px-3 py-2.5 text-left" disabled={make.isPending} onClick={() => start(kind)}>
              {making === kind ? <LoaderCircle className="animate-spin" aria-hidden /> : <Icon className="text-studio" aria-hidden />}
              <span className="grid">
                <span className="font-medium">{label}</span>
                <span className="text-xs font-normal whitespace-normal text-muted-foreground">{about}</span>
              </span>
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-sm">Choose a subject for it first (above): notes are filed under a subject, where Ekagra shows them too.</p>
      )}
      {material.kind === 'youtube' && subjectId && (
        <div className="grid gap-2 text-sm">
          {windows.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">90-min parts:</span>
              {windows.map((win, index) => {
                const winStart = String(Math.floor(win.start / 60))
                const winEnd = String(Math.ceil(win.end / 60))
                const active = startMin === winStart && endMin === winEnd
                return (
                  <Button
                    key={win.start}
                    type="button"
                    size="sm"
                    variant={active ? 'default' : 'outline'}
                    className="h-7 px-2.5 text-xs"
                    onClick={() => {
                      setStartMin(winStart)
                      setEndMin(winEnd)
                    }}
                  >
                    Part {index + 1} ({clockTime(win.start)}–{clockTime(win.end)})
                  </Button>
                )
              })}
              {(durationSec === null || durationSec <= 3 * 3600) && (
                <Button
                  type="button"
                  size="sm"
                  variant={startMin === '' && endMin === '' ? 'default' : 'outline'}
                  className="h-7 px-2.5 text-xs"
                  onClick={() => {
                    setStartMin('')
                    setEndMin('')
                  }}
                >
                  Whole video
                </Button>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="video-start-min" className="text-xs text-muted-foreground">
              Time range (min, optional):
            </Label>
            <Input
              id="video-start-min"
              inputMode="numeric"
              placeholder="0"
              aria-label="Start minute"
              className="h-8 w-20"
              value={startMin}
              onChange={(event) => setStartMin(event.target.value.replace(/\D/g, ''))}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              id="video-end-min"
              inputMode="numeric"
              placeholder={durationSec ? String(Math.ceil(durationSec / 60)) : '90'}
              aria-label="End minute"
              className="h-8 w-20"
              value={endMin}
              onChange={(event) => setEndMin(event.target.value.replace(/\D/g, ''))}
            />
            {durationSec ? <span className="text-xs text-muted-foreground">of {Math.ceil(durationSec / 60)} min ({clockTime(durationSec)})</span> : null}
          </div>
        </div>
      )}
      {material.kind === 'pdf' && subjectId && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Label htmlFor="first-page">Start at page</Label>
          <Input id="first-page" inputMode="numeric" className="h-8 w-20" value={firstPage} onChange={(event) => setFirstPage(event.target.value.replace(/\D/g, ''))} />
          {material.page_count ? <span className="text-xs text-muted-foreground">of {material.page_count}</span> : null}
        </div>
      )}
      {make.error && (
        <p role="alert" className="text-sm text-destructive">
          {make.error.message}
        </p>
      )}
      {(made.data ?? []).length > 0 && (
        <div className="grid gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">Made from this</h3>
          <NoteList notes={made.data ?? []} />
        </div>
      )}
    </section>
  )
}
