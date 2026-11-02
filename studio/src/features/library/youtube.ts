import { watchUrl } from '@shared/youtube.ts'

// YouTube links in Studio: reading a link (shared with Studio's Edge Functions), the links Studio
// builds, and the title from YouTube's public oEmbed (no key needed). Gemini reads public videos
// only; oEmbed can't see private ones either, so a missing title is the first hint.
// Tested in youtube.test.ts.

export { watchUrl, youtubeId } from '@shared/youtube.ts'

/** The privacy-enhanced player: no YouTube cookies until the student plays the video. */
export const embedUrl = (id: string) => `https://www.youtube-nocookie.com/embed/${id}`

/** The video's title and channel from YouTube, or null when it's private, gone, or YouTube can't be reached. */
export async function youtubeTitle(id: string, fetcher: typeof fetch = fetch): Promise<{ title: string; channel: string | null } | null> {
  try {
    const response = await fetcher(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl(id))}`)
    if (!response.ok) return null
    const body: unknown = await response.json()
    if (typeof body !== 'object' || body === null) return null
    const { title, author_name: channel } = body as Record<string, unknown>
    return typeof title === 'string' && title.trim() ? { title: title.trim(), channel: typeof channel === 'string' ? channel : null } : null
  } catch {
    return null
  }
}
