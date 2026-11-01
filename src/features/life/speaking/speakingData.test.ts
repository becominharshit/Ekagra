import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { stubLocalStorage } from '@/test/memoryStorage'
import { deleteSpeakingSession, listSpeakingSessions, practiseWithAi, saveSpeakingSession } from './speakingData'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }

describe('speaking sessions in Demo Mode', () => {
  it('saves the transcript with its words, pace and fillers counted on the device, newest first, and deletes', async () => {
    const first = await saveSpeakingSession(DEMO, {
      scenario: 'interview',
      prompt: ' Tell me about yourself. ',
      durationSec: 30,
      transcript: 'Um, I am a CSE student, matlab I build apps.',
      scores: null,
      feedback: [{ kind: 'tip', text: 'Speak a little longer.' }],
      source: 'device',
    })
    expect(first).toMatchObject({
      prompt: 'Tell me about yourself.',
      duration_sec: 30,
      words: 10,
      wpm: 20,
      filler_count: 2,
      fillers: { um: 1, matlab: 1 },
      scores: {},
      feedback: [{ kind: 'tip', text: 'Speak a little longer.' }],
      source: 'device',
    })
    const second = await saveSpeakingSession(DEMO, { scenario: 'small_talk', prompt: '', durationSec: 0.4, transcript: 'Hello there.', scores: null, feedback: [], source: 'device' })
    expect(second).toMatchObject({ prompt: 'Free practice', duration_sec: 1 })

    const sessions = await listSpeakingSessions(DEMO)
    expect(sessions).toHaveLength(2)
    await deleteSpeakingSession(DEMO, first.id)
    expect((await listSpeakingSessions(DEMO)).map((session) => session.id)).toEqual([second.id])
  })

  it("doesn't save an empty transcript, and has no AI to listen", async () => {
    await expect(saveSpeakingSession(DEMO, { scenario: 'interview', prompt: 'Q', durationSec: 30, transcript: '  ', scores: null, feedback: [], source: 'device' })).rejects.toThrow(/no words/)
    await expect(practiseWithAi(DEMO, { scenario: 'interview', prompt: 'Q', durationSec: 30, audio: { mimeType: 'audio/webm', base64: 'aGVsbG8=' } })).rejects.toThrow(/Demo Mode has no AI/)
  })
})
