import { Capacitor } from '@capacitor/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { deviceFiles } from '@/lib/deviceFiles'
import {
  messageProblem,
  SCREENSHOT_TYPES,
  screenshotProblem,
  type Feedback,
  type FeedbackContext,
  type FeedbackKind,
} from './report'

// Feedback and bug reports. Signed in: a row in feedback and the screenshot in the private "images"
// bucket (<user_id>/feedback/<id>.png); the founder reads both in the Supabase dashboard.
// Demo Mode: both stay on this device (demoDb and IndexedDB), and the student can copy the text.

export const feedbackKey = (owner: string | null) => ['feedback', owner] as const

/** Demo Mode screenshots are saved as "device:<key in deviceFiles>". */
const ON_DEVICE = 'device:'

export interface FeedbackDraft {
  kind: FeedbackKind
  message: string
  /** The screen's name, e.g. "PDF viewer". */
  screen: string
  /** The app address it was sent from. */
  path: string
  screenshot: File | null
  context: FeedbackContext
}

/** The device details sent with feedback (the sheet tells the student what they are). */
export function deviceContext(): FeedbackContext {
  return {
    app: Capacitor.getPlatform(),
    build: __APP_BUILD__,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    browser: navigator.userAgent.slice(0, 300),
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  }
}

const newestFirst = (a: Feedback, b: Feedback) => Date.parse(b.created_at) - Date.parse(a.created_at)

export async function listFeedback(source: DataSource): Promise<Feedback[]> {
  if (source.kind === 'demo') return demoDb.list('feedback').sort(newestFirst)
  const { data, error } = await source.client
    .from('feedback')
    .select('*')
    .eq('user_id', source.userId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw dbError(error)
  return data
}

/** Sends feedback (Demo Mode: saves it on this device). The screenshot goes first, so the row can point at it. */
export async function sendFeedback(source: DataSource, draft: FeedbackDraft): Promise<Feedback> {
  const problem = messageProblem(draft.message) ?? (draft.screenshot ? screenshotProblem(draft.screenshot) : null)
  if (problem) throw new Error(problem)
  const id = crypto.randomUUID()
  const row = {
    id,
    kind: draft.kind,
    message: draft.message.trim(),
    screen: draft.screen.trim().slice(0, 100) || null,
    path: draft.path,
    context: draft.context,
  }

  if (source.kind === 'demo') {
    const key = `feedback/${id}`
    if (draft.screenshot) await deviceFiles.put(key, draft.screenshot)
    const [saved] = demoDb.insert('feedback', [{ ...row, screenshot_path: draft.screenshot ? ON_DEVICE + key : null }])
    if (!saved) throw new Error('The feedback was not saved.')
    return saved
  }

  const screenshot = draft.screenshot
  const screenshotPath = screenshot ? `${source.userId}/feedback/${id}.${SCREENSHOT_TYPES[screenshot.type] ?? 'png'}` : null
  if (screenshot && screenshotPath) {
    const upload = await source.client.storage.from('images').upload(screenshotPath, screenshot, { contentType: screenshot.type })
    if (upload.error) throw new Error(`The screenshot could not be uploaded: ${upload.error.message}`)
  }
  const { data, error } = await source.client.from('feedback').insert({ ...row, screenshot_path: screenshotPath }).select().single()
  if (error) {
    if (screenshotPath) await source.client.storage.from('images').remove([screenshotPath]) // don't leave a file without its row
    throw dbError(error)
  }
  return data
}

export function useFeedback() {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: feedbackKey(owner),
    queryFn: () => listFeedback(need(source)),
    enabled: source !== null,
  })
}

export function useSendFeedback() {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (draft: FeedbackDraft) => sendFeedback(need(source), draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: feedbackKey(owner) })
    },
  })
}
