import { format } from 'date-fns'
import { matchPath } from 'react-router'
import type { Json, Tables } from '@/types/database'

// The plain parts of feedback: the name of the screen it was sent from, the checks before sending,
// and the text version for copying. No storage in here, so Vitest tests it directly.

export type Feedback = Tables<'feedback'>

export const FEEDBACK_KINDS = ['bug', 'idea', 'other'] as const
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]

export const KIND_LABEL: Record<FeedbackKind, string> = { bug: 'Bug', idea: 'Idea', other: 'Other' }

/** The status the founder sets in the dashboard, in the student's words. */
const STATUS_LABEL: Record<string, string> = { new: 'Sent', seen: 'Read', planned: 'Planned', fixed: 'Fixed', closed: 'Closed' }

/** The database's limit (003_beta.sql). */
export const MAX_MESSAGE_LENGTH = 4000
/** The "images" bucket's limit (001_phase1_core.sql). */
export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024
/** Image types the "images" bucket accepts, with the file ending used in storage. */
export const SCREENSHOT_TYPES: Partial<Record<string, string>> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

/** Device details sent with feedback, so the founder can reproduce a bug. */
export type FeedbackContext = {
  /** web or android */
  app: string
  /** When this copy of the app was built (UTC). */
  build: string
  /** The visible part of the screen in CSS pixels, e.g. "412×915". */
  viewport: string
  browser: string
  language: string
  timezone: string
}

/** The app's screens (the routes in src/router.tsx) and their names. */
const SCREENS: [path: string, name: string][] = [
  ['/today', 'Today'],
  ['/today/tasks', 'Tasks'],
  ['/today/focus', 'Focus'],
  ['/today/focus/tollbooth', 'Academic Tollbooth'],
  ['/academics', 'Academics'],
  ['/academics/subjects/:subjectId', 'Subject'],
  ['/academics/subjects/:subjectId/import', 'Syllabus import'],
  ['/academics/subjects/:subjectId/edit', 'Roadmap editor'],
  ['/academics/subjects/:subjectId/papers', 'Past papers'],
  ['/academics/subjects/:subjectId/practice', 'Practice'],
  ['/academics/subjects/:subjectId/mock', 'Mock test'],
  ['/academics/attendance', 'Attendance'],
  ['/academics/grades', 'Grades'],
  ['/academics/library', 'PDF library'],
  ['/academics/library/:materialId', 'PDF viewer'],
  ['/academics/review', 'Review'],
  ['/academics/cards', 'Flashcards'],
  ['/academics/mistakes', 'Mistake notebook'],
  ['/academics/topics/:topicId', 'Topic'],
  ['/academics/code', 'Coding Lab'],
  ['/academics/code/:snippetId', 'Code editor'],
  ['/hustle', 'Hustle'],
  ['/hustle/:hustleId', 'Hustle details'],
  ['/life', 'Life'],
  ['/me', 'Me'],
  ['/me/focus', 'Focus setup'],
  ['/onboarding', 'Setup'],
]

/** The name of the screen at this address, e.g. "/academics/library/<id>" → "PDF viewer". */
export function screenName(pathname: string): string {
  return SCREENS.find(([path]) => matchPath(path, pathname))?.[1] ?? 'Other'
}

export function toKind(value: string): FeedbackKind {
  return (FEEDBACK_KINDS as readonly string[]).includes(value) ? (value as FeedbackKind) : 'other'
}

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status
}

/** Why the message can't be sent yet, or null if it can. */
export function messageProblem(message: string): string | null {
  if (!message.trim()) return 'Write a few words first: what happened, or what would you like?'
  if (message.length > MAX_MESSAGE_LENGTH) return `Please keep it under ${MAX_MESSAGE_LENGTH} characters.`
  return null
}

/** Why this image can't be added, or null if it can. */
export function screenshotProblem(file: Pick<File, 'type' | 'size'>): string | null {
  if (!SCREENSHOT_TYPES[file.type]) return 'Use a PNG, JPG or WebP image.'
  if (file.size > MAX_SCREENSHOT_BYTES) return `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 10 MB.`
  return null
}

function contextField(context: Json, key: keyof FeedbackContext): string | null {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null
  const value = context[key]
  return typeof value === 'string' && value ? value : null
}

/** A short line about the device, e.g. "Android app · build 2026-11-01 14:05 · 412×915". */
export function deviceSummary(context: Json): string {
  const app = contextField(context, 'app')
  const build = contextField(context, 'build')
  return [app === 'android' ? 'Android app' : app === 'web' ? 'Web app' : app, build && `build ${build}`, contextField(context, 'viewport')]
    .filter(Boolean)
    .join(' · ')
}

/** The feedback as plain text, to paste into WhatsApp or an email (Demo Mode can't send it). */
export function feedbackText(item: Pick<Feedback, 'kind' | 'message' | 'screen' | 'path' | 'context' | 'created_at'>): string {
  const device = deviceSummary(item.context)
  return [
    `Ekagra feedback (${KIND_LABEL[toKind(item.kind)]})`,
    `Screen: ${item.screen || 'not given'}${item.path ? ` (${item.path})` : ''}`,
    `Written: ${format(new Date(item.created_at), 'd MMM yyyy, h:mm a')}`,
    ...(device ? [`Device: ${device}`] : []),
    '',
    item.message,
  ].join('\n')
}
