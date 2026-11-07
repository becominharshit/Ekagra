import type { LanguageModel } from 'ai'
import { createAiGateway, type UsageStore } from '../_shared/ai.ts'
import { AiError, readStudioAiConfig } from '../_shared/aiCore.ts'
import { geminiModels } from '../_shared/gemini.ts'
import {
  STUDIO_NOTES_PROMPT_VERSION,
  studioCombineInstructions,
  studioCombinePrompt,
  studioFromNotesPrompt,
  studioNotesInstructions,
  studioNotesPartInstructions,
  studioNotesPrompt,
} from '../_shared/prompts/studioNotes.ts'
import { handleJson, readBody, requireUser } from '../_shared/respond.ts'
import {
  StudioNoteAnswerSchema,
  StudioNotePartAnswerSchema,
  StudioNotesRequestSchema,
  type StudioNoteAnswer,
  type StudioNoteKind,
  type StudioNotePartAnswer,
  type StudioNotesResponse,
} from '../_shared/schemas.ts'
import {
  clockTime,
  fetchVideoDetails,
  lectureFps,
  NOTES_PART_SECONDS,
  VIDEO_PART_SECONDS,
  videoParts,
  watchUrl,
  youtubeId,
  type VideoDetails,
  type VideoPart,
} from '../_shared/youtube.ts'

// studio-notes (Ekagra Studio): notes, a mind map or a revision sheet from one material, made by
// Gemini. The note is saved at once as 'processing' and its id returned; the AI then works in the
// background and fills it in, or marks it 'failed' with the reason. The app checks the note until
// it's done. Problems found before that (the daily limit, a private or too long video, a missing
// key) are answered at once and save nothing.
// A long video is watched in parts at the same time. Its notes are the detailed notes of its
// 15-minute parts joined in order (joinParts: no AI request, so nothing is shortened and no
// per-minute limit is hit); a mind map or revision sheet of a video over 30 minutes is combined from
// its 30-minute parts' by one more request. A mind map or revision sheet of a video that already
// has notes is made from those notes instead.

/** Longer videos don't fit Gemini's context, even at low media resolution (ai.google.dev video docs). */
export const MAX_VIDEO_SECONDS = 3 * 60 * 60
/** Supabase's free plan stops a function after 150 seconds, background work included: this leaves time to save the result. */
export const WORK_TIME_MS = 140_000
/** The most of a video's notes that a mind map or revision sheet is made from (about 50,000 tokens). */
const FROM_NOTES_LENGTH = 200_000

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
  /** The text of the newest finished notes (kind 'notes') made from this material, or null. */
  readyNotes(materialId: string, userId: string): Promise<string | null>
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
  /** Tests pass a wait that returns at once (the gateway waits for Gemini's per-minute limit). */
  sleep?: (ms: number) => Promise<void>
}

/** Why a note couldn't be made, for the student (the note shows it, with Try again). */
function failure(error: unknown, watchingVideo: boolean): string {
  if (error instanceof AiError) {
    if (error.code === 'provider_timeout' && watchingVideo) {
      return 'Gemini needed too long to watch this video, so it was stopped. Please try again in a minute.'
    }
    return error.message
  }
  // Not the AI's answer: saving the note failed, for example. The function's logs have the details.
  console.error('Could not make the note:', error)
  return 'Something went wrong while saving this. Please try again.'
}

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

/** A part's notes without a "# " title or a "## Key points" section of its own (the prompt asks for neither). */
function partBody(markdown: string): string {
  const lines = markdown.trim().split(/\r?\n/)
  while (lines.length > 0 && /^#\s/.test(lines[0] ?? '')) lines.shift()
  const start = lines.findIndex((line) => /^##\s+key points\s*$/i.test(line.trim()))
  if (start < 0) return lines.join('\n').trim()
  const after = lines.findIndex((line, index) => index > start && /^##\s/.test(line))
  return [...lines.slice(0, start), ...(after < 0 ? [] : lines.slice(after))].join('\n').trim()
}

/**
 * The full notes of a long video from its parts: an overview (each part's times and summary), every
 * part's notes in order, then their key points (each once). Pure.
 */
export function joinParts(parts: (VideoPart & StudioNotePartAnswer)[]): string {
  const overview = parts.map((part) => `- **${clockTime(part.start)}–${clockTime(part.end)}:** ${part.summary.trim().replace(/\s+/g, ' ')}`)
  const seen = new Set<string>()
  const keyPoints = parts
    .flatMap((part) => part.keyPoints)
    .map((point) => point.trim().replace(/^[-*]\s+/, ''))
    .filter((point) => {
      const key = point.toLowerCase()
      if (!point || seen.has(key)) return false
      seen.add(key)
      return true
    })
  return [
    '## Overview',
    overview.join('\n'),
    ...parts.map((part) => partBody(part.markdown)).filter(Boolean),
    ...(keyPoints.length > 0 ? ['## Key points', keyPoints.map((point) => `- ${point}`).join('\n')] : []),
  ].join('\n\n')
}

export function handleStudioNotes(makeDeps: () => StudioNotesDeps): (request: Request) => Promise<Response> {
  return handleJson(async (request): Promise<StudioNotesResponse> => {
    const deadline = new Date(Date.now() + WORK_TIME_MS)
    const deps = makeDeps()
    const userId = await requireUser(deps.authenticate, request)
    const input = await readBody(request, StudioNotesRequestSchema)
    const config = readStudioAiConfig(deps.env)
    const ai = createAiGateway({ config, usage: deps.usage, model: deps.model ?? geminiModels(config.apiKey), sleep: deps.sleep })
    // The student hears about the daily limit now, not from a failed note later.
    await ai.ensureQuota(userId)

    let videoUrl: string | null = null
    let fps: number | undefined
    let parts: VideoPart[] = []
    let fromNotes: string | null = null
    if (input.source.kind === 'youtube') {
      const id = youtubeId(input.source.url)
      if (!id) throw new AiError(400, 'bad_request', "That isn't a link to a YouTube video.")
      videoUrl = watchUrl(id)
      // A mind map or revision sheet comes from the video's notes when there are some: seconds, instead of watching it again.
      if (input.kind !== 'notes') {
        fromNotes = await deps.store.readyNotes(input.materialId, userId).catch((error: unknown) => {
          console.error('Could not read the notes of the video:', error)
          return null
        })
      }
      if (!fromNotes) {
        const details = await checkVideo(id, deps)
        if (details) await deps.store.describeVideo(input.materialId, userId, details).catch((error: unknown) => console.error('Could not describe the video:', error))
        fps = lectureFps(details?.durationSec ?? null)
        // Only a video whose length is known (YOUTUBE_API_KEY) can be split; a live stream reports 0.
        // Full notes use shorter parts, so they come out longer and more detailed.
        parts = videoParts(details?.durationSec || null, input.kind === 'notes' ? NOTES_PART_SECONDS : VIDEO_PART_SECONDS)
      }
    }

    const noteId = await deps.store.create({
      userId,
      subjectId: input.subjectId,
      materialId: input.materialId,
      kind: input.kind,
      title: input.title,
      source: videoUrl ? 'youtube' : 'material',
    })

    const asked = { userId, feature: 'studio-notes', deadline }
    // Anything from a video (its parts, or the notes made from it) is long, so the cheaper, quicker model reads it.
    const tier = videoUrl ? 'fast' : 'smart'
    const noteFrom = ({ data, model }: { data: StudioNoteAnswer; model: string }) => ({ title: data.title.trim() || input.title, content: data.markdown.trim(), model })

    /** Full notes of a long video: every part's detailed notes at the same time, joined in order. */
    const fullNotes = async (url: string) => {
      const done = await Promise.all(
        parts.map(async (part, index) => {
          const made = await ai.generate({
            ...asked,
            tier: 'fast',
            schema: StudioNotePartAnswerSchema,
            instructions: studioNotesPartInstructions(),
            prompt: studioNotesPrompt(input, url, fps, { ...part, index, count: parts.length }),
          })
          return { part: { ...part, ...made.data }, model: made.model }
        }),
      )
      return { title: input.title, content: joinParts(done.map(({ part }) => part)), model: done[0]?.model ?? config.models.fast }
    }

    /** A mind map or revision sheet of a long video: its parts' at the same time, then one from theirs (text only, quick). */
    const combined = async (url: string) => {
      const done = await Promise.all(
        parts.map(async (part, index) => {
          const made = await ai.generate({
            ...asked,
            tier: 'fast',
            schema: StudioNoteAnswerSchema,
            instructions: studioNotesInstructions(input.kind),
            prompt: studioNotesPrompt(input, url, fps, { ...part, index, count: parts.length }),
          })
          return { ...part, markdown: made.data.markdown }
        }),
      )
      // Right after the parts, Gemini's free tier may be over its tokens for this minute: the gateway then waits for the next one.
      return noteFrom(
        await ai.generate({ ...asked, tier: 'fast', schema: StudioNoteAnswerSchema, instructions: studioCombineInstructions(input.kind), prompt: studioCombinePrompt(input.title, done) }),
      )
    }

    const make = async () => {
      const instructions = studioNotesInstructions(input.kind)
      if (fromNotes) return noteFrom(await ai.generate({ ...asked, tier, schema: StudioNoteAnswerSchema, instructions, prompt: studioFromNotesPrompt(input, fromNotes.slice(0, FROM_NOTES_LENGTH)) }))
      if (videoUrl && parts.length > 1) return input.kind === 'notes' ? fullNotes(videoUrl) : combined(videoUrl)
      return noteFrom(await ai.generate({ ...asked, tier, schema: StudioNoteAnswerSchema, instructions, prompt: studioNotesPrompt(input, videoUrl, fps) }))
    }

    deps.background(
      (async () => {
        try {
          const made = await make()
          await deps.store.finish(noteId, userId, { ...made, promptVersion: STUDIO_NOTES_PROMPT_VERSION })
        } catch (error) {
          await deps.store.fail(noteId, userId, failure(error, videoUrl !== null && fromNotes === null)).catch((stuck: unknown) => console.error('Could not mark the note as failed:', stuck))
        }
      })(),
    )
    return { noteId }
  })
}
