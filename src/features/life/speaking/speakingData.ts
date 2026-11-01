import { SpeakResponseSchema, type SpeakRequest } from '@shared/schemas.ts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { callAiFunction } from '@/features/ai/aiClient'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { lifeKey } from '../lifeData'
import { speechStats, type FeedbackItem, type Scenario, type Scores, type SpeakingSession } from './speech'

// Speaking sessions, saved in Supabase or (Demo Mode) on the device. Only the transcript, what was
// counted from it and the scores are kept: the recording goes to ai-speak in one request and is
// never stored.

/** The progress chart and the history look this far back. */
const RECENT = 60

const newestFirst = (a: SpeakingSession, b: SpeakingSession) => b.created_at.localeCompare(a.created_at)

export async function listSpeakingSessions(source: DataSource): Promise<SpeakingSession[]> {
  if (source.kind === 'demo') return demoDb.list('speaking_sessions').sort(newestFirst).slice(0, RECENT)
  const { data, error } = await source.client.from('speaking_sessions').select('*').eq('user_id', source.userId).order('created_at', { ascending: false }).limit(RECENT)
  if (error) throw dbError(error)
  return data
}

export interface SessionInput {
  scenario: Scenario
  prompt: string
  durationSec: number
  transcript: string
  /** From the AI; null without it. */
  scores: Scores | null
  feedback: FeedbackItem[]
  source: 'ai' | 'device'
}

/** Saves a session with its words, pace and fillers counted here, from the transcript. */
export async function saveSpeakingSession(source: DataSource, input: SessionInput): Promise<SpeakingSession> {
  const transcript = input.transcript.trim().slice(0, 20_000)
  if (!transcript) throw new Error('There is nothing to save: no words were found.')
  const durationSec = Math.min(1800, Math.max(1, Math.round(input.durationSec)))
  const stats = speechStats(transcript, durationSec)
  const row = {
    scenario: input.scenario,
    prompt: input.prompt.trim().slice(0, 500) || 'Free practice',
    duration_sec: durationSec,
    transcript,
    words: stats.words,
    wpm: Math.min(9999, stats.wpm),
    filler_count: stats.fillerCount,
    fillers: stats.fillers,
    scores: input.scores ?? {},
    feedback: input.feedback.slice(0, 4),
    source: input.source,
  }
  if (source.kind === 'demo') {
    const [saved] = demoDb.insert('speaking_sessions', [row])
    if (!saved) throw new Error('The session was not saved.')
    return saved
  }
  const { data, error } = await source.client.from('speaking_sessions').insert(row).select().single()
  if (error) throw dbError(error)
  return data
}

export async function deleteSpeakingSession(source: DataSource, id: string): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.remove('speaking_sessions', [id])
    return
  }
  const { error } = await source.client.from('speaking_sessions').delete().eq('id', id)
  if (error) throw dbError(error)
}

/**
 * Sends a recording to ai-speak (signed in only), then saves the transcript, what was counted from
 * it and the AI's scores and tips. The recording itself is dropped after this request.
 */
export async function practiseWithAi(source: DataSource, request: SpeakRequest): Promise<SpeakingSession> {
  if (source.kind === 'demo') throw new Error('Demo Mode has no AI to listen. Type what you said instead.')
  const answer = await callAiFunction('ai-speak', request, SpeakResponseSchema, source.client)
  if (!answer.transcript.trim()) throw new Error('No speech was heard. Check that the microphone works, speak up and try again.')
  return saveSpeakingSession(source, {
    scenario: request.scenario,
    prompt: request.prompt,
    durationSec: request.durationSec,
    transcript: answer.transcript,
    scores: answer.scores,
    feedback: [...(answer.strength ? [{ kind: 'strength' as const, text: answer.strength }] : []), ...answer.tips.map((text) => ({ kind: 'tip' as const, text }))],
    source: 'ai',
  })
}

export function useSpeakingSessions() {
  const { source, owner } = useDataSource()
  return useQuery({ queryKey: [...lifeKey(owner), 'speaking'], queryFn: () => listSpeakingSessions(need(source)), enabled: source !== null })
}

/** A change that gives back the saved session (so the screen can show it). Every Life view reloads. */
function useSessionMutation<Variables>(run: (source: DataSource, variables: Variables) => Promise<SpeakingSession>) {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: Variables) => run(need(source), variables),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: lifeKey(owner) })
    },
  })
}

export const usePractiseWithAi = () => useSessionMutation(practiseWithAi)
export const useSaveSpeakingSession = () => useSessionMutation(saveSpeakingSession)
