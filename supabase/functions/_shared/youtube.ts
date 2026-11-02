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
