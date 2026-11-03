import { describe, expect, it } from 'vitest'
import { clockTime, embedUrl, fetchVideoDetails, isoDurationSeconds, lectureFps, videoParts } from './youtube.ts'

describe('how Gemini watches a lecture', () => {
  it('sees every second of a short video, and 1 frame every 5 seconds of a long one or one of unknown length', () => {
    expect([lectureFps(60), lectureFps(20 * 60), lectureFps(20 * 60 + 1), lectureFps(7155), lectureFps(null)]).toEqual([1, 1, 0.2, 0.2, 0.2])
  })

  it('splits a lecture over 30 minutes into equal parts of at most 30 minutes, and not one of unknown length', () => {
    expect(videoParts(null)).toEqual([])
    expect(videoParts(30 * 60)).toEqual([])
    expect(videoParts(45 * 60)).toEqual([
      { start: 0, end: 1350 },
      { start: 1350, end: 2700 },
    ])
    expect(videoParts(7155)).toEqual([
      { start: 0, end: 1789 },
      { start: 1789, end: 3578 },
      { start: 3578, end: 5367 },
      { start: 5367, end: 7155 },
    ])
    expect(videoParts(3 * 3600)).toHaveLength(6)
  })

  it('writes times like a video player', () => {
    expect([clockTime(0), clockTime(95), clockTime(1789), clockTime(3723), clockTime(7155)]).toEqual(['0:00', '1:35', '29:49', '1:02:03', '1:59:15'])
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
