import { useMutation, useQueryClient } from '@tanstack/react-query'
import { InboxResponseSchema, MAX_FILE_BYTES, type InboxKind } from '@shared/schemas.ts'
import { MIN_PDF_TEXT, type SourceDraft } from '@/features/academics/source'
import { academicsKey, createSubject, type Subject } from '@/features/academics/subjects'
import { callAiFunction } from '@/features/ai/aiClient'
import { addPdf, addPhotoMaterial, addTextMaterial, type Material } from '@/features/materials/materials'
import { profileRepoFor } from '@/features/profile/queries'
import { need, useDataSource, type DataSource } from '@/lib/dataSource'
import { fileToSource, shrinkPhoto } from '@/lib/files'
import { classifyOnDevice, yearIn } from './classify'
import { linkClasses, mergeClasses, routineWithTimetable, type TimetableClass } from './timetable'

// The Add inbox: the student adds a file, a photo or text, Ekagra works out what it is (ai-inbox;
// keywords in Demo Mode) and, once the student confirms, files it: a syllabus or past paper goes to
// its import screen, a timetable into the routine, study material into materials (Ekagra Studio sees
// it there when signed in), a task into the + capture sheet. Nothing is saved before that.

/** Photos are made smaller before the AI reads them; this size keeps a timetable's small print readable. */
const PHOTO_SIDE = 1600
/** Recognising something needs only its beginning. */
const TEXT_FOR_AI = 15_000

export interface InboxItem {
  /** The file's name, or null for typed text. */
  name: string | null
  /** The file itself: a PDF goes to the library as it is. */
  file: File | null
  kind: 'pdf' | 'photo' | 'text'
  /** What the syllabus and past-paper screens read: the text, or a file for the AI. */
  source: SourceDraft
  pageCount: number | null
}

/** A PDF (its text is read on the device) or a photo (made smaller on the device). */
export async function readUpload(file: File): Promise<InboxItem> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const { readPdfText } = await import('@/lib/pdf')
    const { pages, pageCount } = await readPdfText(await file.arrayBuffer())
    const text = pages.join('\n\n').trim()
    let source: SourceDraft
    if (text.replace(/\s/g, '').length >= MIN_PDF_TEXT) {
      const note = pageCount > pages.length ? `Read the first ${pages.length} of ${pageCount} pages on your device.` : `Read ${pageCount} pages on your device.`
      source = { kind: 'pdf', text, file: null, note }
    } else if (file.size <= MAX_FILE_BYTES) {
      source = { kind: 'pdf', text: '', file: await fileToSource(file), note: 'This PDF looks scanned, so the AI will read its pages.' }
    } else {
      source = { kind: 'pdf', text: '', file: null, note: "This PDF looks scanned and is over 5 MB, so the AI can't read it. It can still go into your Library." }
    }
    return { name: file.name, file, kind: 'pdf', source, pageCount }
  }
  if (file.type.startsWith('image/')) {
    const photo = await shrinkPhoto(file, PHOTO_SIDE, 0.85)
    return { name: file.name, file, kind: 'photo', source: { kind: 'photo', text: '', file: photo, note: `The AI will read the photo (${file.name}).` }, pageCount: null }
  }
  throw new Error('Add a PDF or a photo (JPG, PNG or WebP), or paste the text.')
}

export function typedItem(text: string): InboxItem {
  return { name: null, file: null, kind: 'text', source: { kind: 'text', text: text.trim(), file: null, note: null }, pageCount: null }
}

export interface InboxSuggestion {
  kind: InboxKind
  title: string
  summary: string | null
  subjectId: string | null
  /** A subject to make for it, when none of the student's fits. */
  newSubject: string | null
  year: number | null
  classes: TimetableClass[]
  /** Guessed on the device from its name and words (Demo Mode, or nothing the AI could read). */
  guessed: boolean
}

/** A name for an upload: the file name without its extension, or the first line of the text. */
export function defaultTitle(item: Pick<InboxItem, 'name' | 'source'>): string {
  if (item.name) return item.name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_+/g, ' ').trim().slice(0, 120) || 'Untitled'
  const first = item.source.text.split('\n').find((line) => line.trim()) ?? ''
  return first.trim().slice(0, 80) || 'Notes'
}

/** The first subject whose name or code shows up in the file name or the text. */
export function subjectMentioned(subjects: Pick<Subject, 'id' | 'name' | 'code'>[], item: Pick<InboxItem, 'name' | 'source'>): string | null {
  const haystack = ` ${(item.name ?? '').replace(/[_.-]+/g, ' ')} ${item.source.text.slice(0, 5000)} `.toLowerCase()
  const mentions = (word: string | null) => {
    const clean = word?.trim().toLowerCase()
    return Boolean(clean && clean.length >= 2 && new RegExp(`[^a-z0-9]${clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^a-z0-9]`).test(haystack))
  }
  return subjects.find((subject) => mentions(subject.code) || mentions(subject.name))?.id ?? null
}

/** What the upload is and where it belongs: from the AI when signed in, a keyword guess in Demo Mode. */
export async function analyseUpload(source: DataSource, item: InboxItem, subjects: Subject[]): Promise<InboxSuggestion> {
  const text = item.source.text.slice(0, TEXT_FOR_AI)
  if (source.kind === 'demo' || (!text.trim() && !item.source.file)) {
    const kind = classifyOnDevice({ fileName: item.name, text })
    return {
      kind,
      title: defaultTitle(item),
      summary: null,
      subjectId: kind === 'timetable' ? null : subjectMentioned(subjects, item),
      newSubject: null,
      year: kind === 'past_paper' ? yearIn(item.name, text) : null,
      classes: [],
      guessed: true,
    }
  }
  const keyed = subjects.slice(0, 40).map((subject, index) => ({ key: `s${index + 1}`, subject }))
  const answer = await callAiFunction(
    'ai-inbox',
    {
      fileName: item.name?.slice(0, 200) ?? null,
      text: text.trim() || undefined,
      file: item.source.file ?? undefined,
      pageCount: item.pageCount,
      subjects: keyed.map(({ key, subject }) => ({ key, name: subject.name.slice(0, 120), code: subject.code?.slice(0, 40) ?? null })),
    },
    InboxResponseSchema,
  )
  const idByKey = new Map(keyed.map(({ key, subject }) => [key, subject.id]))
  const idOf = (key: string | null) => (key ? (idByKey.get(key) ?? null) : null)
  return {
    kind: answer.kind,
    title: answer.title || defaultTitle(item),
    summary: answer.summary || null,
    subjectId: idOf(answer.subjectKey),
    newSubject: answer.newSubject,
    year: answer.year,
    classes: mergeClasses(answer.classes.map((found) => ({ subject: found.subject, subjectId: idOf(found.subjectKey), days: found.days, start: found.start, end: found.end }))),
    guessed: false,
  }
}

/** The chosen subject, or a new one with the given name; null when neither was given. */
export async function subjectFor(source: DataSource, { subjectId, newName }: { subjectId: string | null; newName: string | null }): Promise<string | null> {
  if (subjectId) return subjectId
  const name = newName?.trim()
  if (!name) return null
  return (await createSubject(source, { name: name.slice(0, 120) })).id
}

/** Saves study material: a PDF into the library, a photo or text as material (Ekagra Studio uses them). */
export async function saveStudyMaterial(
  source: DataSource,
  { item, subjectId, newName, title }: { item: InboxItem; subjectId: string | null; newName: string | null; title: string },
): Promise<Material> {
  const subject = await subjectFor(source, { subjectId, newName })
  if (item.kind === 'pdf' && item.file) return addPdf(source, { file: item.file, subjectId: subject, title })
  if (item.kind === 'photo' && item.source.file) return addPhotoMaterial(source, { photo: item.source.file, subjectId: subject, title })
  return addTextMaterial(source, { text: item.source.text, subjectId: subject, title })
}

/**
 * Puts the timetable's classes into the routine in place of the old class times. With `addCourses`,
 * those course names first become subjects, and their classes are linked to them (for attendance).
 */
export async function saveTimetable(source: DataSource, { classes, addCourses }: { classes: TimetableClass[]; addCourses: string[] }): Promise<number> {
  if (classes.length === 0) throw new Error('There are no class times to save.')
  const repo = profileRepoFor(source)
  const current = await repo.getRoutine()
  // Checked before any subject is made, so a problem never leaves half the work done.
  const checked = routineWithTimetable(current, classes)
  if (checked.problems.length > 0) throw new Error(checked.problems[0])
  const made: Subject[] = []
  for (const name of addCourses) made.push(await createSubject(source, { name: name.slice(0, 120) }))
  const { rows } = made.length > 0 ? routineWithTimetable(current, linkClasses(classes, made)) : checked
  await repo.replaceRoutine(rows)
  return classes.length
}

/** Runs an inbox action; afterwards Academics, the routine and so the plan reload. */
export function useInboxAction<Variables, Result>(run: (source: DataSource, variables: Variables) => Promise<Result>) {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: Variables) => run(need(source), variables),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: academicsKey(owner) })
      await queryClient.invalidateQueries({ queryKey: ['routine', owner] })
    },
  })
}
