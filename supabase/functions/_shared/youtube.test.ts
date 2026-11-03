import { describe, expect, it } from 'vitest'
import { embedUrl, fetchVideoDetails, isoDurationSeconds, lectureFps } from './youtube.ts'

describe('how Gemini watches a lecture', () => {
  it('sees every second of a short video, and 1 frame every 5 seconds of a long one or one of unknown length', () => {
    expect([lectureFps(60), lectureFps(20 * 60), lectureFps(20 * 60 + 1), lectureFps(7155), lectureFps(null)]).toEqual([1, 1, 0.2, 0.2, 0.2])
  })

  it('plays it in the privacy-enhanced player', () => {
    expect(embedUrl('9hE5-98ZeCg')).toBe('https://www.youtube-nocookie.com/embed/9hE5-98ZeCg')
  })
})

describe('YouTube video details', () => {
  it('reads ISO 8601 durations as YouTube gives them', () => {
    expect([isoDurationSeconds('PT1H2M3S'), isoDurationSeconds('PT45M'), isoDurationSeconds('PT59S'), isoDurationSeconds('P1DT2H'), isoDurationSeconds('P0D')]).toEqual([
      3723, 2700, 59, 93_600, 0,
    ])
    expect([isoDurationSeconds(''), isoDurationSeconds('P'), isoDurationSeconds('PT'), isoDurationSeconds('1 hour')]).toEqual([null, null, null, null])
  })

  it('gets the title, length and privacy, or null when there is no such video', async () => {
    const asked: string[] = []
    const answer = (body: unknown, status = 200) =>
      (async (url: string) => {
        asked.push(url)
        return new Response(JSON.stringify(body), { status })
      }) as unknown as typeof fetch
    const video = { items: [{ snippet: { title: ' Joins ' }, contentDetails: { duration: 'PT12M30S' }, status: { privacyStatus: 'unlisted' } }] }
    expect(await fetchVideoDetails('9hE5-98ZeCg', 'key-1', answer(video))).toEqual({ title: 'Joins', durationSec: 750, privacy: 'unlisted' })
    expect(asked[0]).toBe('https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status&id=9hE5-98ZeCg&key=key-1')
    expect(await fetchVideoDetails('9hE5-98ZeCg', 'key-1', answer({ items: [] }))).toBeNull()
    await expect(fetchVideoDetails('9hE5-98ZeCg', 'bad', answer({ error: {} }, 400))).rejects.toThrow(/answered 400/)
  })
})
