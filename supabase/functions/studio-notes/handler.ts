import type { LanguageModel } from 'ai'
import { createAiGateway, type UsageStore } from '../_shared/ai.ts'
import { AiError, readStudioAiConfig } from '../_shared/aiCore.ts'
import { geminiModels } from '../_shared/gemini.ts'
import { STUDIO_NOTES_PROMPT_VERSION, studioNotesInstructions, studioNotesPrompt } from '../_shared/prompts/studioNotes.ts'
import { handleJson, readBody, requireUser } from '../_shared/respond.ts'
import { StudioNoteAnswerSchema, StudioNotesRequestSchema, type StudioNoteKind, type StudioNotesResponse } from '../_shared/schemas.ts'
import { fetchVideoDetails, watchUrl, youtubeId, type VideoDetails } from '../_shared/youtube.ts'

// studio-notes (Ekagra Studio): notes, a mind map or a revision sheet from one material, made by
// Gemini. The note is saved at once as 'processing' and its id returned; the AI then works in the
// background (a long lecture takes a minute or two) and fills it in, or marks it 'failed' with the
// reason. The app checks the note until it's done. Problems found before that (the daily limit, a
// private or too long video, a missing key) are answered at once and save nothing.

/** Longer videos don't fit Gemini's context, even at low media resolution (ai.google.dev video docs). */
export const MAX_VIDEO_SECONDS = 3 * 60 * 60

export interface NoteRow {
  userId: string
  subjectId: string
  materialId: string
  kind: StudioNoteKind
  title: string
  source: 'youtube' | 'material'
}

/** Where notes are saved: the notes table in production, memory in tests. */
export interface NotesStore {
  /** Saves a new note as 'processing' and returns its id. */
  create(row: NoteRow): Promise<string>
  finish(noteId: string, userId: string, result: { title: string; content: string; model: string; promptVersion: string }): Promise<void>
  fail(noteId: string, userId: string, error: string): Promise<void>
  /** Gives a YouTube material YouTube's title (if it still has the plain one) and length. */
  describeVideo(materialId: string, userId: string, details: VideoDetails): Promise<void>
}

export interface StudioNotesDeps {
  env: Record<string, string | undefined>
  authenticate(request: Request): Promise<string | null>
  usage: UsageStore
  store: NotesStore
  /** Keeps work going after the answer is sent (EdgeRuntime.waitUntil on Supabase). */
  background(task: Promise<void>): void
  /** Tests pass a fake model; production uses Gemini. */
  model?: (modelId: string) => LanguageModel
  fetcher?: typeof fetch
}

const failure = (error: unknown) => (error instanceof AiError ? error.message : 'The AI service did not answer. Please try again in a minute.')

/** YouTube's view of the video, when YOUTUBE_API_KEY is set: refuses private and too long videos before anything is spent. */
async function checkVideo(id: string, deps: StudioNotesDeps): Promise<VideoDetails | null> {
  const key = deps.env.YOUTUBE_API_KEY?.trim()
  if (!key) return null
  let details: VideoDetails | null
  try {
    details = await fetchVideoDetails(id, key, deps.fetcher)
  } catch (error) {
    // The YouTube API being unavailable shouldn't stop the notes: Gemini still says if it can't watch the video.
    console.error('YouTube Data API:', error instanceof Error ? error.message : error)
    return null
  }
  if (!details) throw new AiError(422, 'video_not_found', "YouTube doesn't have this video. It may have been deleted.")
  if (details.privacy !== 'public') throw new AiError(422, 'video_not_public', 'This video is private or unlisted. Studio can only make notes from public videos.')
  if (details.durationSec > MAX_VIDEO_SECONDS) {
    throw new AiError(422, 'video_too_long', `This video is ${Math.floor(details.durationSec / 3600)} hours long. Studio can make notes from videos of up to 3 hours.`)
  }
  return details
}

export function handleStudioNotes(makeDeps: () => StudioNotesDeps): (request: Request) => Promise<Response> {
  return handleJson(async (request): Promise<StudioNotesResponse> => {
    const deps = makeDeps()
    const userId = await requireUser(deps.authenticate, request)
    const input = await readBody(request, StudioNotesRequestSchema)
    const config = readStudioAiConfig(deps.env)
    const ai = createAiGateway({ config, usage: deps.usage, model: deps.model ?? geminiModels(config.apiKey) })
    // The student hears about the daily limit now, not from a failed note later.
    await ai.ensureQuota(userId)

    let videoUrl: string | null = null
    if (input.source.kind === 'youtube') {
      const id = youtubeId(input.source.url)
      if (!id) throw new AiError(400, 'bad_request', "That isn't a link to a YouTube video.")
      videoUrl = watchUrl(id)
      const details = await checkVideo(id, deps)
      if (details) await deps.store.describeVideo(input.materialId, userId, details).catch((error: unknown) => console.error('Could not describe the video:', error))
    }

    const noteId = await deps.store.create({
      userId,
      subjectId: input.subjectId,
      materialId: input.materialId,
      kind: input.kind,
      title: input.title,
      source: videoUrl ? 'youtube' : 'material',
    })

    deps.background(
      (async () => {
        try {
          const { data, model } = await ai.generate({
            userId,
            feature: 'studio-notes',
            // A video is long (about 100 tokens a second), so the cheaper model reads it.
            tier: videoUrl ? 'fast' : 'smart',
            schema: StudioNoteAnswerSchema,
            instructions: studioNotesInstructions(input.kind),
            prompt: studioNotesPrompt(input, videoUrl),
          })
          await deps.store.finish(noteId, userId, { title: data.title.trim() || input.title, content: data.markdown.trim(), model, promptVersion: STUDIO_NOTES_PROMPT_VERSION })
        } catch (error) {
          await deps.store.fail(noteId, userId, failure(error)).catch((stuck: unknown) => console.error('Could not mark the note as failed:', stuck))
        }
      })(),
    )
    return { noteId }
  })
}
