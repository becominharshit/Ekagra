import { SPEAK_CAPTURES, SPEAK_SCENARIOS, SPEAK_SCORES } from '@shared/schemas.ts'
import { format, parseISO } from 'date-fns'
import { dateKeyInTimezone } from '@/lib/timezone'
import type { Tables } from '@/types/database'

// Speaking practice: the kinds of speech and their questions, and what is counted in code from a
// transcript - words, words per minute and filler words (English and Hinglish) - with tips from
// those numbers when there is no AI. Pure functions, tested on their own.

export type SpeakingSession = Tables<'speaking_sessions'>
export type Scenario = (typeof SPEAK_SCENARIOS)[number]
export type ScoreName = (typeof SPEAK_SCORES)[number]
export type Scores = Record<ScoreName, number>
/** Where the words came from: speech-to-text (checked by the student), or typed. */
export type Capture = (typeof SPEAK_CAPTURES)[number]
export { SPEAK_SCENARIOS, SPEAK_SCORES }

/** Seconds spoken as saved and sent: whole, from 1 second to 30 minutes. */
export function wholeSeconds(seconds: number): number {
  return Math.min(1800, Math.max(1, Math.round(seconds)))
}

/** Pieces of speech-to-text (earlier runs, finished phrases, the phrase still being heard) as one transcript. */
export function joinSpeech(pieces: (string | undefined)[]): string {
  return pieces
    .map((piece) => piece?.trim() ?? '')
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
}

export const SCENARIO_LABEL: Record<Scenario, string> = { interview: 'Interview', presentation: 'Presentation', group_discussion: 'Group discussion', small_talk: 'Small talk' }

export const SCENARIO_HINT: Record<Scenario, string> = {
  interview: 'Speak for 1–2 minutes: your answer first, then one example, then why it matters.',
  presentation: 'Say what you will cover, make 2 or 3 points, then sum up.',
  group_discussion: 'Take a side, give two reasons with examples, and answer the other view.',
  small_talk: 'Keep it relaxed: share a little, then ask a question back.',
}

export const SCORE_LABEL: Record<ScoreName, string> = { clarity: 'Clarity', structure: 'Structure', vocabulary: 'Vocabulary', confidence: 'Confidence' }

export const PROMPTS: Record<Scenario, string[]> = {
  interview: [
    'Tell me about yourself.',
    'Why should we pick you for this internship?',
    'Describe a project you are proud of.',
    'What is your biggest weakness?',
    'Tell me about a time something went wrong in a team, and what you did.',
    'Where do you see yourself in five years?',
  ],
  presentation: [
    'Explain your favourite subject this semester to a first-year student.',
    'Present a project you built, in two minutes.',
    'Teach one topic from your last lecture in simple words.',
    'Pitch an app idea that would help students at your college.',
  ],
  group_discussion: [
    'Should attendance be compulsory in college?',
    'Is AI a threat or an opportunity for early-career jobs?',
    'Online classes or offline classes: which are better?',
    'Should social media be banned for children under 16?',
    'Is a college degree still needed to succeed?',
  ],
  small_talk: [
    'Introduce yourself to a new classmate.',
    'What did you do last weekend?',
    'Describe your hometown to someone who has never been there.',
    'Talk about a film or series you enjoyed recently.',
  ],
}

/** The question at `index` for a kind of speech, going round the list. */
export function promptAt(scenario: Scenario, index: number): string {
  const list = PROMPTS[scenario]
  return list[((index % list.length) + list.length) % list.length] ?? ''
}

export function toScenario(value: string): Scenario {
  return SPEAK_SCENARIOS.find((scenario) => scenario === value) ?? 'interview'
}

// ---------------------------------------------------------------------------
// Words and filler words
// ---------------------------------------------------------------------------

export const FILLERS = ['um', 'uh', 'like', 'basically', 'actually', 'literally', 'you know', 'i mean', 'matlab', 'yaar'] as const
export type Filler = (typeof FILLERS)[number]
export const FILLER_LABEL: Record<Filler, string> = {
  um: 'um',
  uh: 'uh',
  like: 'like',
  basically: 'basically',
  actually: 'actually',
  literally: 'literally',
  'you know': 'you know',
  'i mean': 'I mean',
  matlab: 'matlab',
  yaar: 'yaar',
}

/** Words that always count as fillers when they are said. */
const ALWAYS: readonly Filler[] = ['basically', 'actually', 'literally', 'matlab', 'yaar']

/** How a filler is shown ("I mean"), for any saved name. */
export function fillerLabel(name: string): string {
  const filler = FILLERS.find((known) => known === name)
  return filler ? FILLER_LABEL[filler] : name
}
/** Hesitation sounds as people write them: um, umm, uhm, hmm, mm, erm → "um"; uh, uhh, er, err → "uh". */
const UM = /^(u+h?m+|h+m+|m{2,}|e+r*m+)$/
const UH = /^(u+h+|e+r+)$/
/** After these, "like" is a verb or a comparison, not a filler: "I like", "looks like", "it was like a dream". */
const LIKE_KEPT_AFTER: ReadonlySet<string> = new Set([
  ...['i', 'you', 'we', 'they', 'he', 'she', 'would', "i'd", "you'd", 'really', 'also', 'just', 'to', 'do', 'does', 'did', "don't", "doesn't", "didn't"],
  ...['look', 'looks', 'looked', 'looking', 'feel', 'feels', 'felt', 'feeling', 'seem', 'seems', 'seemed', 'sound', 'sounds', 'sounded'],
  ...['is', 'was', 'are', 'were', 'be', 'been', 'am', "it's", "that's", 'something', 'anything', 'nothing', 'more', 'much', 'exactly', 'things', 'people'],
])
/** After these, "you know" is a real question or clause: "do you know", "if you know". */
const YOU_KNOW_KEPT_AFTER: ReadonlySet<string> = new Set(['do', 'did', 'does', "don't", "didn't", 'if', 'what', 'as', 'would', 'will', 'can', 'could', 'should'])

interface Token {
  word: string
  start: number
  end: number
}

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu

function tokenize(text: string): Token[] {
  return [...text.matchAll(WORD)].map((match) => ({ word: match[0].toLowerCase().replace(/’/g, "'"), start: match.index, end: match.index + match[0].length }))
}

export function countWords(text: string): number {
  return tokenize(text).length
}

/** Each filler said, with where it is in the transcript (so it can be highlighted). */
export function findFillers(text: string): { filler: Filler; start: number; end: number }[] {
  const tokens = tokenize(text)
  const found: { filler: Filler; start: number; end: number }[] = []
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (!token) continue
    const before = tokens[index - 1]
    const after = tokens[index + 1]
    const gapBefore = text.slice(before?.end ?? 0, token.start)
    const gapAfter = text.slice(token.end, after?.start ?? text.length)
    const startsSentence = !before || /[.?!]/.test(gapBefore)
    const add = (filler: Filler, end = token.end) => found.push({ filler, start: token.start, end })
    const always = ALWAYS.find((filler) => filler === token.word)

    if (UM.test(token.word)) add('um')
    else if (UH.test(token.word)) add('uh')
    else if (always) add(always)
    else if (token.word === 'like') {
      // "…, like, …" or "Like, …"; or in the middle of a sentence after a word that doesn't make it a verb or comparison.
      const setOff = (startsSentence || gapBefore.includes(',')) && gapAfter.includes(',')
      const loose = !startsSentence && !gapBefore.includes(',') && before !== undefined && !LIKE_KEPT_AFTER.has(before.word)
      if (setOff || loose) add('like')
    } else if (token.word === 'you' && after?.word === 'know' && !(before && YOU_KNOW_KEPT_AFTER.has(before.word))) {
      add('you know', after.end)
      index += 1
    } else if (token.word === 'i' && after?.word === 'mean' && before?.word !== 'what') {
      add('i mean', after.end)
      index += 1
    }
  }
  return found
}

export function countFillers(text: string): Partial<Record<Filler, number>> {
  const counts: Partial<Record<Filler, number>> = {}
  for (const { filler } of findFillers(text)) counts[filler] = (counts[filler] ?? 0) + 1
  return counts
}

/** The transcript in pieces, fillers marked, for showing it with them highlighted. */
export function markFillers(text: string): { text: string; filler: boolean }[] {
  const pieces: { text: string; filler: boolean }[] = []
  let at = 0
  for (const { start, end } of findFillers(text)) {
    if (start > at) pieces.push({ text: text.slice(at, start), filler: false })
    pieces.push({ text: text.slice(start, end), filler: true })
    at = end
  }
  if (at < text.length) pieces.push({ text: text.slice(at), filler: false })
  return pieces
}

/** The fillers said most, most first. */
export function topFillers(fillers: Partial<Record<string, number>>): { filler: string; count: number }[] {
  return Object.entries(fillers)
    .flatMap(([filler, count]) => (typeof count === 'number' && count > 0 ? [{ filler, count }] : []))
    .sort((a, b) => b.count - a.count)
}

export interface SpeechStats {
  words: number
  /** Words per minute. */
  wpm: number
  fillers: Partial<Record<Filler, number>>
  fillerCount: number
  fillersPerMinute: number
}

const oneDecimal = (value: number) => Math.round(value * 10) / 10

export function speechStats(transcript: string, durationSec: number): SpeechStats {
  const words = countWords(transcript)
  const fillers = countFillers(transcript)
  const fillerCount = Object.values(fillers).reduce((sum, count) => sum + count, 0)
  const minutes = Math.max(1, durationSec) / 60
  return { words, wpm: oneDecimal(words / minutes), fillers, fillerCount, fillersPerMinute: oneDecimal(fillerCount / minutes) }
}

/** A comfortable pace for interviews and presentations, in words a minute. */
export const GOOD_PACE = { min: 110, max: 160 } as const

export function paceOf(wpm: number): 'slow' | 'good' | 'fast' {
  if (wpm < GOOD_PACE.min) return 'slow'
  if (wpm > GOOD_PACE.max) return 'fast'
  return 'good'
}

export const PACE_LABEL = { slow: 'A bit slow', good: 'A good pace', fast: 'A bit fast' } as const

/** Fillers a minute: up to 2 is few, up to 5 some, more is many. */
export function fillerLevel(perMinute: number): 'few' | 'some' | 'many' {
  if (perMinute <= 2) return 'few'
  if (perMinute <= 5) return 'some'
  return 'many'
}

/** Tips from the numbers alone (Demo Mode, or a typed answer): pace, the top filler, length. */
export function deviceTips(stats: SpeechStats, durationSec: number): string[] {
  const tips: string[] = []
  const pace = paceOf(stats.wpm)
  const [top, next] = topFillers(stats.fillers)
  if (fillerLevel(stats.fillersPerMinute) !== 'few' && top) {
    tips.push(
      top.count >= 2
        ? `You said "${fillerLabel(top.filler)}" ${top.count === 2 ? 'twice' : `${top.count} times`}. When you feel it coming, pause for a second instead.`
        : `You used ${stats.fillerCount} filler words, such as "${fillerLabel(top.filler)}"${next ? ` and "${fillerLabel(next.filler)}"` : ''}. When you feel one coming, pause for a second instead.`,
    )
  }
  if (pace === 'fast') tips.push(`About ${Math.round(stats.wpm)} words a minute is a bit fast: slow down and pause between your points.`)
  if (pace === 'slow') tips.push(`About ${Math.round(stats.wpm)} words a minute is a bit slow: say the answer once more, so the words come easier.`)
  if (durationSec < 45) tips.push('Speak a little longer: aim for at least a minute, with one example.')
  if (tips.length === 0) tips.push('A steady pace and few fillers: well done. Try a harder question next.')
  return tips.slice(0, 3)
}

// ---------------------------------------------------------------------------
// Saved sessions
// ---------------------------------------------------------------------------

/** A tip or the thing done well. A type (not an interface) so it can be saved as JSON. */
export type FeedbackItem = { kind: 'strength' | 'tip'; text: string }

/** A session's scores (1–10), or null when there are none (no AI) or they're broken. */
export function readScores(json: unknown): Scores | null {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null
  const values = json as Record<string, unknown>
  const read = (name: ScoreName) => {
    const value = values[name]
    return typeof value === 'number' && value >= 1 && value <= 10 ? value : null
  }
  const [clarity, structure, vocabulary, confidence] = [read('clarity'), read('structure'), read('vocabulary'), read('confidence')]
  if (clarity === null || structure === null || vocabulary === null || confidence === null) return null
  return { clarity, structure, vocabulary, confidence }
}

export function averageScore(scores: Scores): number {
  return oneDecimal(SPEAK_SCORES.reduce((sum, name) => sum + scores[name], 0) / SPEAK_SCORES.length)
}

export function readFeedback(json: unknown): FeedbackItem[] {
  if (!Array.isArray(json)) return []
  return json.flatMap((item): FeedbackItem[] => {
    if (typeof item !== 'object' || item === null) return []
    const { kind, text } = item as Record<string, unknown>
    return (kind === 'strength' || kind === 'tip') && typeof text === 'string' && text.trim() ? [{ kind, text: text.trim() }] : []
  })
}

export function readFillers(json: unknown): Partial<Record<string, number>> {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return {}
  return Object.fromEntries(Object.entries(json).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] >= 0))
}

/** "2:05" for 125 seconds. */
export function clockLabel(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** Seconds of practice on a date ('YYYY-MM-DD') in `timeZone` (or OS local time if omitted). */
export function practisedOn(sessions: Pick<SpeakingSession, 'created_at' | 'duration_sec'>[], date: string, timeZone?: string): number {
  return sessions
    .filter((session) => (timeZone ? dateKeyInTimezone(session.created_at, timeZone) === date : format(parseISO(session.created_at), 'yyyy-MM-dd') === date))
    .reduce((sum, session) => sum + session.duration_sec, 0)
}

/** The last `count` sessions, oldest first, as points for the progress charts (null: no AI scores). */
export function progressSeries(sessions: Pick<SpeakingSession, 'created_at' | 'wpm' | 'filler_count' | 'duration_sec' | 'scores'>[], count = 12) {
  const recent = [...sessions].sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-count)
  return {
    from: recent[0]?.created_at ?? null,
    wpm: recent.map((session) => Math.round(Number(session.wpm ?? 0))),
    fillersPerMinute: recent.map((session) => oneDecimal(session.filler_count / (Math.max(1, session.duration_sec) / 60))),
    score: recent.map((session) => {
      const scores = readScores(session.scores)
      return scores ? averageScore(scores) : null
    }),
  }
}
