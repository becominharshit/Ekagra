import { describe, expect, it, vi } from 'vitest'
import { callAiFunction } from '@/features/ai/aiClient'
import type { DataSource } from '@/lib/dataSource'
import { stubLocalStorage } from '@/test/memoryStorage'
import { deleteSpeakingSession, listSpeakingSessions, practiseWithAi, saveSpeakingSession } from './speakingData'

vi.mock('@/features/ai/aiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/ai/aiClient')>()),
  callAiFunction: vi.fn(),
}))

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

  it("doesn't save an empty transcript, and has no AI", async () => {
    await expect(saveSpeakingSession(DEMO, { scenario: 'interview', prompt: 'Q', durationSec: 30, transcript: '  ', scores: null, feedback: [], source: 'device' })).rejects.toThrow(/no words/)
    await expect(practiseWithAi(DEMO, { scenario: 'interview', prompt: 'Q', durationSec: 30, transcript: 'Hello.', captured: 'typed' })).rejects.toThrow(/Demo Mode has no AI/)
  })
})

describe('speaking feedback when signed in', () => {
  it('sends only the words with the pace and fillers counted here, then saves them with the scores', async () => {
    const inserted: unknown[] = []
    const client = {
      from: () => ({
        insert: (row: Record<string, unknown>) => {
          inserted.push(row)
          return { select: () => ({ single: async () => ({ data: { ...row, id: 's1', created_at: '2026-11-02T10:00:00.000Z' }, error: null }) }) }
        },
      }),
    }
    const signedIn = { kind: 'supabase', userId: 'u', client } as unknown as DataSource
    vi.mocked(callAiFunction).mockResolvedValueOnce({
      scores: { clarity: 7, structure: 6, vocabulary: 7, confidence: 5 },
      strength: 'A clear goal.',
      tips: ['Pause instead of saying basically.'],
      model: 'claude-haiku-5-5',
      promptVersion: 'speak-v2',
    })

    const session = await practiseWithAi(signedIn, {
      scenario: 'interview',
      prompt: 'Tell me about yourself.',
      durationSec: 30,
      transcript: ' So basically I am a CSE student, matlab I build apps. ',
      captured: 'speech',
    })

    expect(vi.mocked(callAiFunction).mock.calls[0]?.slice(0, 2)).toEqual([
      'ai-speak',
      {
        scenario: 'interview',
        prompt: 'Tell me about yourself.',
        durationSec: 30,
        transcript: 'So basically I am a CSE student, matlab I build apps.',
        captured: 'speech',
        wpm: 22,
        fillers: [
          { filler: 'basically', count: 1 },
          { filler: 'matlab', count: 1 },
        ],
      },
    ])
    expect(inserted).toEqual([
      expect.objectContaining({
        transcript: 'So basically I am a CSE student, matlab I build apps.',
        words: 11,
        filler_count: 2,
        scores: { clarity: 7, structure: 6, vocabulary: 7, confidence: 5 },
        feedback: [
          { kind: 'strength', text: 'A clear goal.' },
          { kind: 'tip', text: 'Pause instead of saying basically.' },
        ],
        source: 'ai',
      }),
    ])
    expect(session.id).toBe('s1')
  })
})
