// YouTube links and video details, shared by Ekagra Studio (the app) and its Edge Functions.
// This file has no imports: it is bundled for Deno and for the app.

const ID = /^[A-Za-z0-9_-]{11}$/

/** The 11-character id of a YouTube video (watch, youtu.be, shorts, embed, live, mobile and music links), or null. */
export function youtubeId(input: string): string | null {
  const text = input.trim()
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '')
  let id: string | null = null
  if (host === 'youtu.be') id = url.pathname.split('/')[1] ?? null
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [first, second] = url.pathname.split('/').filter(Boolean)
    if (first === 'watch') id = url.searchParams.get('v')
    else if (first === 'shorts' || first === 'embed' || first === 'live' || first === 'v') id = second ?? null
  }
  return id && ID.test(id) ? id : null
}

/** The plain watch link, the form Gemini reads. */
export const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`

/** The privacy-enhanced player: no YouTube cookies until the student plays the video. */
export const embedUrl = (id: string) => `https://www.youtube-nocookie.com/embed/${id}`

/** Videos up to this long are watched at Gemini's usual 1 frame a second. */
const FULL_FRAME_RATE_SECONDS = 20 * 60

/**
 * Frames a second Gemini looks at in a lecture video. The sound (what the teacher says) is always
 * heard in full; slides and the board change slowly, so a longer video (or one of unknown length)
 * is seen at 1 frame every 5 seconds. A 2-hour lecture is then about 330,000 tokens instead of 740,000.
 */
export function lectureFps(durationSec: number | null): number {
  return durationSec !== null && durationSec <= FULL_FRAME_RATE_SECONDS ? 1 : 0.2
}

/**
 * A lecture longer than this is watched in parts of at most this length, all at the same time.
 * Gemini needed over 2 minutes for a whole 2-hour lecture, but 15 seconds for its four 30-minute
 * parts together (measured 2026-11-03).
 */
export const VIDEO_PART_SECONDS = 30 * 60

/**
 * Full notes use shorter parts: Gemini writes about as much for each request whatever its length
 * (about 600 words for 20 minutes, measured 2026-11-03), so more parts give more detailed notes. A
 * 2-hour lecture's 8 parts (about 275,000 tokens) still all start within Google's free tier minute,
 * which lets requests in until 250,000 tokens are used.
 */
export const NOTES_PART_SECONDS = 15 * 60

/** Default chapter window (90 minutes = 6 × 15-min parts ≈ 248k tokens, fitting inside the 250k TPM free-tier minute). */
export const DEFAULT_WINDOW_SECONDS = 90 * 60

/** Seconds from the start of the video. */
export interface VideoPart {
  start: number
  end: number
}

/**
 * Preset time windows (90 minutes each by default) for a marathon lecture longer than `windowSeconds`.
 * Returns an empty list when the video is short enough to watch in one go or its length is unknown.
 */
export function videoWindows(durationSec: number | null, windowSeconds = DEFAULT_WINDOW_SECONDS): VideoPart[] {
  if (durationSec === null || durationSec <= windowSeconds) return []
  const count = Math.ceil(durationSec / windowSeconds)
  return Array.from({ length: count }, (_, index) => ({
    start: index * windowSeconds,
    end: Math.min(durationSec, (index + 1) * windowSeconds),
  }))
}

/**
 * The parts a lecture (or a chosen `[startSec, endSec]` window of it) is watched in:
 * none (the whole video at once) when no sub-window is chosen and the video is up to `partSeconds`
 * or of unknown length, else equal parts covering the window.
 */
export function videoParts(
  durationSec: number | null,
  partSeconds = VIDEO_PART_SECONDS,
  startSec?: number | null,
  endSec?: number | null,
): VideoPart[] {
  const hasWindow = (startSec !== undefined && startSec !== null) || (endSec !== undefined && endSec !== null)
  const total = durationSec !== null && durationSec > 0 ? durationSec : null
  const start = Math.max(0, Math.floor(startSec ?? 0))
  const rawEnd = endSec !== undefined && endSec !== null ? Math.floor(endSec) : total
  const end = rawEnd !== null && total !== null ? Math.min(total, rawEnd) : rawEnd
  if (end === null || end <= start) return []
  const span = end - start
  if (!hasWindow && span <= partSeconds) return []
  const count = Math.ceil(span / partSeconds)
  const length = Math.ceil(span / count)
  return Array.from({ length: count }, (_, index) => ({
    start: start + index * length,
    end: Math.min(end, start + (index + 1) * length),
  }))
}

/** 95 → "1:35", 3723 → "1:02:03". */
export function clockTime(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = String(whole % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

/** Seconds in an ISO 8601 duration as YouTube gives it ("PT1H2M3S" = 3723), or null. */
export function isoDurationSeconds(iso: string): number | null {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso)
  if (!match || iso === 'P' || iso.endsWith('T')) return null
  const [, days = '0', hours = '0', minutes = '0', seconds = '0'] = match
  return Number(days) * 86_400 + Number(hours) * 3_600 + Number(minutes) * 60 + Number(seconds)
}

export interface VideoDetails {
  title: string
  /** 0 for a live stream that is still going. */
  durationSec: number
  privacy: 'public' | 'unlisted' | 'private' | string
}

/**
 * A video's title, length and privacy from the YouTube Data API (videos.list, 1 quota unit), or
 * null when there's no such video. Throws when the API can't be used (a wrong key, the quota).
 */
export async function fetchVideoDetails(id: string, apiKey: string, fetcher: typeof fetch = fetch): Promise<VideoDetails | null> {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status&id=${encodeURIComponent(id)}&key=${encodeURIComponent(apiKey)}`
  const response = await fetcher(url)
  if (!response.ok) throw new Error(`The YouTube Data API answered ${response.status}.`)
  const body = (await response.json()) as { items?: { snippet?: { title?: string }; contentDetails?: { duration?: string }; status?: { privacyStatus?: string } }[] }
  const item = body.items?.[0]
  if (!item) return null
  return {
    title: item.snippet?.title?.trim() || 'YouTube video',
    durationSec: isoDurationSeconds(item.contentDetails?.duration ?? '') ?? 0,
    privacy: item.status?.privacyStatus ?? 'public',
  }
}
