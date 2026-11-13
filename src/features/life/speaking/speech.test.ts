import { describe, expect, it } from 'vitest'
import {
  averageScore,
  clockLabel,
  countFillers,
  countWords,
  deviceTips,
  fillerLabel,
  fillerLevel,
  joinSpeech,
  markFillers,
  paceOf,
  practisedOn,
  progressSeries,
  promptAt,
  readFeedback,
  readFillers,
  readScores,
  speechStats,
  topFillers,
  wholeSeconds,
} from './speech'

describe('filler words', () => {
  it('counts English and Hinglish fillers, and leaves "like", "you know" and "I mean" alone when they are real words', () => {
    const transcript =
      'Um, so basically I am a second-year student. Matlab, I like coding, you know? It was, like, amazing. ' +
      'Uh I mean the project was like a dream. Do you know Python? Yaar, umm, what I mean is simple.'
    expect(countFillers(transcript)).toEqual({ um: 2, basically: 1, matlab: 1, 'you know': 1, like: 1, uh: 1, 'i mean': 1, yaar: 1 })
  })

  it('counts "like" in the middle of a sentence, but not as a verb or at the start of a comparison', () => {
    expect(countFillers('And like we went home.')).toEqual({ like: 1 })
    expect(countFillers('Like many students, I code at night. It looks like rain.')).toEqual({})
    expect(countFillers('Like, I was so tired.')).toEqual({ like: 1 })
  })

  it('marks the fillers in the transcript for highlighting', () => {
    expect(markFillers('Um, I like it, like, a lot.')).toEqual([
      { text: 'Um', filler: true },
      { text: ', I like it, ', filler: false },
      { text: 'like', filler: true },
      { text: ', a lot.', filler: false },
    ])
  })

  it('lists the most said fillers first, and shows their names', () => {
    expect(topFillers({ um: 2, like: 5, uh: 0 })).toEqual([
      { filler: 'like', count: 5 },
      { filler: 'um', count: 2 },
    ])
    expect([fillerLabel('i mean'), fillerLabel('hmm')]).toEqual(['I mean', 'hmm'])
  })
})

describe('pace and tips', () => {
  it('counts words (hyphens split, apostrophes keep a word whole) and words per minute', () => {
    expect(countWords("I'm a second-year student")).toBe(5)
    expect(speechStats('word '.repeat(130), 60)).toEqual({ words: 130, wpm: 130, fillers: {}, fillerCount: 0, fillersPerMinute: 0 })
    expect(speechStats('um '.repeat(6) + 'word '.repeat(114), 90)).toMatchObject({ words: 120, wpm: 80, fillerCount: 6, fillersPerMinute: 4 })
  })

  it('judges pace (110–160 words a minute is good) and fillers (up to 2 a minute is few)', () => {
    expect([100, 130, 170].map(paceOf)).toEqual(['slow', 'good', 'fast'])
    expect([1, 4, 8].map(fillerLevel)).toEqual(['few', 'some', 'many'])
  })

  it('gives tips from the numbers when there is no AI', () => {
    expect(deviceTips(speechStats('um '.repeat(6) + 'word '.repeat(114), 90), 90)).toEqual([
      'You said "um" 6 times. When you feel it coming, pause for a second instead.',
      'About 80 words a minute is a bit slow: say the answer once more, so the words come easier.',
    ])
    expect(deviceTips(speechStats('word '.repeat(90), 30), 30)).toEqual([
      'About 180 words a minute is a bit fast: slow down and pause between your points.',
      'Speak a little longer: aim for at least a minute, with one example.',
    ])
    expect(deviceTips(speechStats('word '.repeat(130), 60), 60)).toEqual(['A steady pace and few fillers: well done. Try a harder question next.'])
    // Different fillers once each: the tip is about all of them.
    expect(deviceTips(speechStats(`Um, basically I like it, you know. ${'word '.repeat(20)}`, 12), 12)[0]).toBe(
      'You used 3 filler words, such as "um" and "basically". When you feel one coming, pause for a second instead.',
    )
  })
})

describe('saved sessions and recordings', () => {
  it('reads scores, feedback and fillers back, leaving out broken ones', () => {
    const scores = { clarity: 7, structure: 6, vocabulary: 7, confidence: 5 }
    expect(readScores(scores)).toEqual(scores)
    expect(readScores({ ...scores, clarity: 11 })).toBeNull()
    expect(readScores({})).toBeNull()
    expect(averageScore(scores)).toBe(6.3)
    expect(readFeedback([{ kind: 'strength', text: ' A clear goal. ' }, { kind: 'tip', text: 'Pause.' }, { kind: 'other', text: 'x' }, 'oops', { kind: 'tip', text: ' ' }])).toEqual([
      { kind: 'strength', text: 'A clear goal.' },
      { kind: 'tip', text: 'Pause.' },
    ])
    expect(readFillers({ um: 2, like: 'x', uh: -1 })).toEqual({ um: 2 })
  })

  it('joins speech-to-text pieces into one transcript, and keeps lengths whole and in range', () => {
    // Earlier runs, finished phrases (with gaps) and the phrase still being heard.
    expect(joinSpeech(['so basically I am', undefined, '  a CSE student ', '', 'matlab  I like apps'])).toBe('so basically I am a CSE student matlab I like apps')
    expect(joinSpeech([' ', undefined])).toBe('')
    expect([0.4, 62.6, 5000].map(wholeSeconds)).toEqual([1, 63, 1800])
  })

  it("adds up today's practice and turns sessions into chart points, oldest first", () => {
    const at = (day: number, hour: number) => new Date(2026, 10, day, hour).toISOString()
    const session = (createdAt: string, wpm: number, fillers: number, seconds: number, scores: Record<string, number>) => ({ created_at: createdAt, wpm, filler_count: fillers, duration_sec: seconds, scores })
    const sessions = [
      session(at(3, 9), 142.6, 3, 90, { clarity: 8, structure: 7, vocabulary: 7, confidence: 6 }),
      session(at(2, 21), 120, 6, 60, {}),
      session(at(3, 1), 131, 0, 45, {}),
    ]
    expect(practisedOn(sessions, '2026-11-03')).toBe(135)
    expect(
      practisedOn(
        [
          { created_at: '2026-11-04T02:00:00.000Z', duration_sec: 45 }, // 2026-11-03 21:00 in America/New_York
          { created_at: '2026-11-04T02:00:00.000Z', duration_sec: 30 },
        ],
        '2026-11-03',
        'America/New_York',
      ),
    ).toBe(75)
    expect(progressSeries(sessions)).toEqual({ from: at(2, 21), wpm: [120, 131, 143], fillersPerMinute: [6, 0, 2], score: [null, null, 7] })
    expect([0, 65, 125.4].map(clockLabel)).toEqual(['0:00', '1:05', '2:05'])
  })

  it('goes round the practice questions', () => {
    expect(promptAt('small_talk', 0)).toBe('Introduce yourself to a new classmate.')
    expect(promptAt('small_talk', 4)).toBe(promptAt('small_talk', 0))
    expect(promptAt('small_talk', -1)).toBe('Talk about a film or series you enjoyed recently.')
  })
})
