import { describe, expect, it } from 'vitest'
import { embedUrl, watchUrl, youtubeId, youtubeTitle } from './youtube'

const ID = '9hE5-98ZeCg'

describe('youtubeId', () => {
  it('reads every common kind of YouTube link', () => {
    const links = [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://www.youtube.com/watch?app=desktop&v=${ID}&t=42s`,
      `youtube.com/watch?v=${ID}`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://music.youtube.com/watch?v=${ID}&list=x`,
      `https://youtu.be/${ID}?si=abc`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube.com/live/${ID}?feature=share`,
      `  https://www.youtube-nocookie.com/embed/${ID}  `,
    ]
    expect(links.map(youtubeId)).toEqual(links.map(() => ID))
  })

  it('refuses links that are not one YouTube video', () => {
    expect(['', 'hello', 'https://vimeo.com/123', 'https://www.youtube.com/@channel', 'https://www.youtube.com/watch?v=short', 'https://evil.example/watch?v=' + ID].map(youtubeId)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ])
  })

  it('builds the watch and privacy-enhanced embed links', () => {
    expect(watchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`)
    expect(embedUrl(ID)).toBe(`https://www.youtube-nocookie.com/embed/${ID}`)
  })
})

describe('youtubeTitle', () => {
  const answer = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

  it("gets a public video's title and channel", async () => {
    expect(await youtubeTitle(ID, answer(200, { title: ' DBMS in one shot ', author_name: 'Gate Smashers' }))).toEqual({ title: 'DBMS in one shot', channel: 'Gate Smashers' })
  })

  it('gives nothing for a private or missing video, or without a connection', async () => {
    expect(await youtubeTitle(ID, answer(401, 'Unauthorized'))).toBeNull()
    expect(await youtubeTitle(ID, answer(200, { author_name: 'x' }))).toBeNull()
    expect(await youtubeTitle(ID, (async () => Promise.reject(new TypeError('offline'))) as unknown as typeof fetch)).toBeNull()
  })
})
