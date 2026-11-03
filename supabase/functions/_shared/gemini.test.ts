import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { describe, expect, it } from 'vitest'
import { createAiGateway } from './ai.ts'
import { readStudioAiConfig } from './aiCore.ts'
import { studioNotesInstructions, studioNotesPrompt } from './prompts/studioNotes.ts'
import { STUDIO_QUIZ_INSTRUCTIONS, studioQuizPrompt } from './prompts/studioQuiz.ts'
import { StudioNoteAnswerSchema, StudioQuizAnswerSchema, type StudioNotesRequest } from './schemas.ts'
import { memoryUsage } from './testing.ts'

// The AI gateway with the real Gemini provider (@ai-sdk/google) and a pretend network: what Ekagra
// Studio sends to Gemini (the model, thinking, a YouTube link, a photo, the answer's JSON shape) and
// how the answer and its cost come back. Nothing leaves the computer.

type Json = Record<string, unknown>

/** Gemini that answers `answer` (as JSON text) every time, keeping each request (URL and body). */
function fakeGemini(answer: unknown) {
  const sent: { url: string; body: Json }[] = []
  const pretendFetch = async (url: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ url: String(url), body: JSON.parse(String(init?.body)) as Json })
    const reply = {
      candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(answer) }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 200_000, candidatesTokenCount: 4_000, totalTokenCount: 204_000 },
    }
    return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const google = createGoogleGenerativeAI({ apiKey: 'gemini-test-key', fetch: pretendFetch as typeof fetch })
  return { model: (modelId: string) => google(modelId), sent }
}

const BASE: StudioNotesRequest = {
  materialId: '22222222-2222-4222-8222-222222222222',
  subjectId: '11111111-1111-4111-8111-111111111111',
  kind: 'notes',
  title: 'Lecture 4',
  source: { kind: 'youtube', url: 'https://youtu.be/9hE5-98ZeCg' },
}

async function generate(request: StudioNotesRequest, videoUrl: string | null, tier: 'smart' | 'fast', fps?: number) {
  const gemini = fakeGemini({ title: 'SQL joins', markdown: '## Joins\n- Inner' })
  const usage = memoryUsage()
  const ai = createAiGateway({ config: readStudioAiConfig({ GEMINI_API_KEY: 'gemini-test-key' }), usage, model: gemini.model })
  const result = await ai.generate({
    userId: 'student-1',
    feature: 'studio-notes',
    tier,
    schema: StudioNoteAnswerSchema,
    instructions: studioNotesInstructions(request.kind),
    prompt: studioNotesPrompt(request, videoUrl, fps),
  })
  return { result, sent: gemini.sent, usage }
}

const parts = (body: Json | undefined): unknown[] => {
  const contents = body?.contents
  const first = Array.isArray(contents) ? (contents[0] as Json | undefined) : undefined
  return Array.isArray(first?.parts) ? first.parts : []
}

describe('Ekagra Studio on Gemini (the real provider, no network)', () => {
  it('sends a YouTube video as its link (fileData), to the fast model, thinking a little, asking for JSON', async () => {
    const { result, sent, usage } = await generate(BASE, 'https://www.youtube.com/watch?v=9hE5-98ZeCg', 'fast')
    expect(result).toEqual({ data: { title: 'SQL joins', markdown: '## Joins\n- Inner' }, model: 'gemini-3.5-flash-lite' })
    expect(sent).toHaveLength(1)
    expect(sent[0]?.url).toContain('/models/gemini-3.5-flash-lite:generateContent')
    expect(parts(sent[0]?.body)).toContainEqual({ fileData: { mimeType: 'video/mp4', fileUri: 'https://www.youtube.com/watch?v=9hE5-98ZeCg' } })
    const config = (sent[0]?.body.generationConfig ?? {}) as Json
    expect(config).toMatchObject({ responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'low' } })
    expect(config.responseSchema ?? config.responseJsonSchema).toBeDefined()
    // 200,000 tokens in and 4,000 out at $0.30 / $2.50 per million.
    expect(usage.logged).toEqual([expect.objectContaining({ feature: 'studio-notes', model: 'gemini-3.5-flash-lite', inputTokens: 200_000, outputTokens: 4_000, costUsd: 0.07 })])
  })

  it('tells Gemini how many frames a second to look at, next to the link', async () => {
    const { sent } = await generate(BASE, 'https://www.youtube.com/watch?v=9hE5-98ZeCg', 'fast', 0.2)
    expect(parts(sent[0]?.body)).toContainEqual({
      fileData: { mimeType: 'video/mp4', fileUri: 'https://www.youtube.com/watch?v=9hE5-98ZeCg' },
      videoMetadata: { fps: 0.2 },
    })
  })

  it('sends a photo inline, and text as text, to the smart model', async () => {
    const photo = await generate({ ...BASE, source: { kind: 'file', file: { mimeType: 'image/jpeg', base64: 'aGVsbG8=' } } }, null, 'smart')
    expect(photo.sent[0]?.url).toContain('/models/gemini-3.8-flash:generateContent')
    expect(parts(photo.sent[0]?.body)).toContainEqual({ inlineData: { mimeType: 'image/jpeg', data: 'aGVsbG8=' } })

    const text = await generate({ ...BASE, kind: 'revision_sheet', source: { kind: 'text', text: 'BCNF: every determinant is a key.' } }, null, 'smart')
    expect(JSON.stringify(parts(text.sent[0]?.body))).toContain('BCNF: every determinant is a key.')
    expect(JSON.stringify(text.sent[0]?.body.systemInstruction)).toContain('revision sheet')
  })

  it("gives Gemini the quiz's answer shape and reads the questions back", async () => {
    const question = { prompt: 'What does an inner join keep?', options: ['Matching rows', 'All rows', 'No rows', 'Left rows'], correctOption: 0, explanation: 'Only matches.', difficulty: 2 }
    const gemini = fakeGemini({ questions: [question] })
    const ai = createAiGateway({ config: readStudioAiConfig({ GEMINI_API_KEY: 'gemini-test-key' }), usage: memoryUsage(), model: gemini.model })
    const result = await ai.generate({
      userId: 'student-1',
      feature: 'studio-quiz',
      tier: 'smart',
      schema: StudioQuizAnswerSchema,
      instructions: STUDIO_QUIZ_INSTRUCTIONS,
      prompt: studioQuizPrompt({ noteId: BASE.materialId, title: 'SQL joins', text: '## Inner join\n- Matching rows', count: 5 }),
    })
    expect(result.data.questions).toEqual([question])
    const config = (gemini.sent[0]?.body.generationConfig ?? {}) as Json
    expect(config.responseMimeType).toBe('application/json')
    expect(JSON.stringify(config.responseSchema ?? config.responseJsonSchema)).toContain('correctOption')
  })
})
