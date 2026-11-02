// YouTube links: the video's id from any common kind of link, the links Studio builds from it, and
// the title from YouTube's public oEmbed (no key needed). Gemini reads public videos only; oEmbed
// can't see private ones either, so a missing title is the first hint. Tested in youtube.test.ts.

const ID = /^[A-Za-z0-9_-]{11}$/

/** The 11-character id of a YouTube video (watch, youtu.be, shorts, embed, live, mobile and music links), or null. */
export function youtubeId(input: string): string | null {
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`)
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

export const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`
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
