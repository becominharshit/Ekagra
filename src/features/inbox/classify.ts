import type { InboxKind } from '@shared/schemas.ts'

// Demo Mode has no AI, so the Add inbox guesses what an upload is from its file name and words.
// The student can always pick another kind. Signed in, this is only used when there's nothing the
// AI could read (a scanned PDF too big to send). Pure, tested in classify.test.ts.

/** Each kind's tell-tale words. A rule counts once, however often it matches; the file name counts 3 times. */
const RULES: { kind: Exclude<InboxKind, 'other'>; words: RegExp[] }[] = [
  {
    kind: 'timetable',
    words: [/time\s?-?table/, /\bschedule\b/, /\bperiods?\b/, /\b(monday|tuesday|wednesday|thursday|friday|saturday)\b/, /\b\d{1,2}[:.]\d{2}\s*(-|–|to)\s*\d{1,2}[:.]\d{2}\b/],
  },
  {
    kind: 'syllabus',
    words: [/\bsyllabus\b/, /\bcurriculum\b/, /\bunit[\s-]*(i{1,3}|iv|v|[1-6])\b/, /\bmodule[\s-]*[1-6]\b/, /\bcourse (outcomes?|objectives?)\b/, /\breference books?\b/, /\btext\s?books?\b/],
  },
  {
    kind: 'past_paper',
    words: [/question paper/, /\b(end|mid)[\s-]?sem(ester)?\b/, /\bmax(imum)?\.? marks\b/, /\btime:?\s*\d+\s*(hours?|hrs?)\b/, /\b(answer|attempt) (any|all)\b/, /\bpyqs?\b/, /\bexamination\b/],
  },
  {
    kind: 'task',
    words: [/\bdeadline\b/, /\bdue (on|by|date|today|tomorrow)\b/, /\bsubmi(t|ssion)\b/, /\blast date\b/, /\btomorrow\b/, /\btonight\b/, /\bremind(er)?\b/, /\bfees?\b/, /\bby (mon|tues|wednes|thurs|fri|satur|sun)day\b/],
  },
  {
    kind: 'study_material',
    words: [/\bnotes?\b/, /\bchapter\b/, /\blecture\b/, /\bslides?\b/, /\bppt\b/, /\btutorial\b/, /\blab manual\b/, /\bquestion bank\b/],
  },
]

/** Short typed text without tell-tale words is most likely a to-do. */
const SHORT_TEXT = 280

/** A file name as words: "DBMS_Syllabus-2026.pdf" → "dbms syllabus 2026 pdf". */
const nameWords = (fileName: string | null) => (fileName ?? '').toLowerCase().replace(/[_.-]+/g, ' ')

export function classifyOnDevice({ fileName, text }: { fileName: string | null; text: string }): Exclude<InboxKind, 'other'> {
  const name = nameWords(fileName)
  const body = text.slice(0, 5000).toLowerCase()
  let best: { kind: Exclude<InboxKind, 'other'>; score: number } | null = null
  for (const rule of RULES) {
    const score = rule.words.reduce((total, word) => total + (word.test(name) ? 3 : 0) + (word.test(body) ? 1 : 0), 0)
    if (score > 0 && (!best || score > best.score)) best = { kind: rule.kind, score }
  }
  if (best) return best.kind
  return fileName === null && text.trim().length <= SHORT_TEXT ? 'task' : 'study_material'
}

/** A 4-digit exam year (1990–2099) in the file name or text, e.g. for a past paper. */
export function yearIn(fileName: string | null, text: string): number | null {
  const match = `${nameWords(fileName)} ${text.slice(0, 3000)}`.match(/\b(199\d|20\d{2})\b/)
  return match ? Number(match[1]) : null
}
