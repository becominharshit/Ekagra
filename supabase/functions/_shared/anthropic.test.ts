import { createAnthropic } from '@ai-sdk/anthropic'
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { captureFeature } from '../ai-capture/feature.ts'
import { speakFeature } from '../ai-speak/feature.ts'
import { syllabusFeature } from '../ai-syllabus/feature.ts'
import { createAiGateway, MAX_OUTPUT_TOKENS } from './ai.ts'
import { readAiConfig } from './aiCore.ts'
import { handleAiRequest, type AiFeature, type ServerDeps } from './http.ts'
import * as shapes from './schemas.ts'
import { memoryUsage } from './testing.ts'

// The AI gateway with the real Anthropic provider (@ai-sdk/anthropic) and a pretend network: what
// the AI functions send to Claude (the model, thinking, images and PDFs, the answer's JSON shape)
// and how the answer and its cost come back. Nothing leaves the computer.

type Json = Record<string, unknown>
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const asRecord = (value: unknown): Json => (isRecord(value) ? value : {})

/** Claude that answers `answer` (as JSON text) every time, keeping each request it was sent. */
function fakeClaude(answer: unknown) {
  const sent: Json[] = []
  const pretendFetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
    sent.push(asRecord(JSON.parse(String(init?.body))))
    const message = {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'claude',
      content: [{ type: 'text', text: JSON.stringify(answer) }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 1200, output_tokens: 300 },
    }
    return new Response(JSON.stringify(message), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const anthropic = createAnthropic({ apiKey: 'sk-ant-test', fetch: pretendFetch as typeof fetch })
  return { model: (modelId: string) => anthropic(modelId), sent }
}

/** One request through an AI function, with only the Anthropic key set (everything else is the default). */
async function call<I, O>(feature: AiFeature<I, O>, body: unknown, answer: unknown) {
  const claude = fakeClaude(answer)
  const usage = memoryUsage()
  const deps = (): ServerDeps => ({ env: { AI_API_KEY: 'sk-ant-test' }, authenticate: async () => 'student-1', usage, model: claude.model })
  const response = await handleAiRequest(feature, deps)(new Request('http://localhost/ai', { method: 'POST', body: JSON.stringify(body) }))
  return { response, sent: claude.sent, usage }
}

const firstContent = (body: Json | undefined): unknown => asRecord(Array.isArray(body?.messages) ? body.messages[0] : undefined).content

// A 1×1 PNG and a tiny PDF, as base64.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'
const PDF = 'JVBERi0xLjQKJcfsj6IKMSAwIG9iago8PD4+CmVuZG9iagp0cmFpbGVyCjw8Pj4KJSVFT0YK'

/** Keywords Anthropic's structured output turns down with a 400 (platform.claude.com/docs/en/build-with-claude/structured-outputs). */
const REFUSED = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'maxItems', 'uniqueItems', 'minProperties', 'maxProperties', 'not']

/** What in a JSON schema Claude would refuse, its open objects, and its unions and optional fields (at most 16 and 24 per request). */
function shapeReport(schema: unknown) {
  const report = { refused: [] as string[], openObjects: 0, unions: 0, optional: 0 }
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!isRecord(node)) return
    report.refused.push(...REFUSED.filter((key) => key in node))
    if (typeof node.minItems === 'number' && node.minItems > 1) report.refused.push('minItems')
    if (Array.isArray(node.anyOf) || Array.isArray(node.type)) report.unions += 1
    if (node.type === 'object' && node.additionalProperties !== false) report.openObjects += 1
    if (isRecord(node.properties)) {
      const required = new Set(Array.isArray(node.required) ? node.required : [])
      report.optional += Object.keys(node.properties).filter((name) => !required.has(name)).length
      Object.values(node.properties).forEach(visit)
    }
    visit(node.items)
    visit(node.anyOf)
    visit(node.allOf)
  }
  visit(schema)
  return report
}

describe('the AI gateway on Claude (the real Anthropic provider, no network)', () => {
  it('sends a screenshot to Claude Haiku 5.5 as an image, without thinking, and logs the cost at Haiku prices', async () => {
    const tasks = { tasks: [{ title: 'DBMS assignment', area: 'academics', subjectKey: 's1', hustleKey: null, lead: false, dueAt: null, estMinutes: 120, priority: 2, unsure: [] }] }
    const request = { now: '2026-11-02T14:30:00+05:30', timezone: 'Asia/Kolkata', subjects: [{ key: 's1', name: 'DBMS', code: null }], file: { mimeType: 'image/png', base64: PNG } }
    const { response, sent, usage } = await call(captureFeature, request, tasks)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ tasks: [{ title: 'DBMS assignment', subjectKey: 's1' }], model: 'claude-haiku-5-5' })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ model: 'claude-haiku-5-5', max_tokens: MAX_OUTPUT_TOKENS, thinking: { type: 'disabled' }, output_config: { format: { type: 'json_schema' } } })
    expect(sent[0]).not.toHaveProperty('temperature')
    expect(firstContent(sent[0])).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } })]))
    // 1,200 × $0.10/M + 300 × $0.50/M
    expect(usage.logged).toEqual([expect.objectContaining({ feature: 'capture', model: 'claude-haiku-5-5', inputTokens: 1200, outputTokens: 300, costUsd: 0.00027 })])
  })

  it('sends a scanned PDF syllabus to Claude Sonnet 5.5 as a document, thinking a little first', async () => {
    const tree = { units: [{ title: 'Unit 1', topics: [{ key: 'u1t1', title: 'ER model', track: 'exam', estMinutes: 90, difficulty: 2, examWeight: 0.6, prerequisites: [] }] }] }
    const { response, sent, usage } = await call(syllabusFeature, { subjectName: 'DBMS', file: { mimeType: 'application/pdf', base64: PDF } }, tree)

    expect(response.status).toBe(200)
    expect(sent[0]).toMatchObject({ model: 'claude-sonnet-5-5', thinking: { type: 'adaptive' }, output_config: { effort: 'low', format: { type: 'json_schema' } } })
    expect(firstContent(sent[0])).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: PDF } })]))
    // 1,200 × $2/M + 300 × $10/M
    expect(usage.logged).toEqual([expect.objectContaining({ model: 'claude-sonnet-5-5', costUsd: 0.0054 })])
  })

  it('sends speaking practice as text only: no sound, image or document', async () => {
    const request = { scenario: 'interview', prompt: 'Tell me about yourself.', durationSec: 40, transcript: 'I am a CSE student, matlab I build apps.', captured: 'speech', wpm: 135, fillers: [{ filler: 'matlab', count: 1 }] }
    const answer = { scores: { clarity: 7, structure: 6, vocabulary: 7, confidence: 6 }, strength: 'A clear start.', tips: ['Give one example.'] }
    const { response, sent } = await call(speakFeature, request, answer)

    expect(response.status).toBe(200)
    expect(firstContent(sent[0])).toEqual([expect.objectContaining({ type: 'text', text: expect.stringContaining('matlab I build apps') })])
    expect(JSON.stringify(sent[0])).not.toMatch(/audio|"type":"image"|"type":"document"/)
  })

  it("gives Claude every AI answer's shape in a form its structured output accepts", async () => {
    const answers: Record<string, z.ZodType> = {
      syllabus: shapes.TopicTreeSchema,
      papers: shapes.PaperAnalysisSchema,
      generate: shapes.GeneratedTopicSchema,
      tutor: shapes.TutorAnswerSchema,
      capture: shapes.CaptureAnswerSchema,
      brief: shapes.BriefAnswerSchema,
      hustle: shapes.HustlePlanAnswerSchema,
      grade: shapes.gradeAnswerSchemaFor([{ key: 'a1', marks: 5 }]),
      review: shapes.reviewAnswerSchemaFor({ stats: { subjects: [] } } as unknown as Pick<shapes.ReviewRequest, 'stats'>),
      meal: shapes.MealAnswerSchema,
      speak: shapes.SpeakAnswerSchema,
    }
    for (const [feature, schema] of Object.entries(answers)) {
      const claude = fakeClaude({})
      const ai = createAiGateway({ config: readAiConfig({ AI_API_KEY: 'sk-ant-test' }), usage: memoryUsage(), model: claude.model })
      // "{}" is the wrong shape, so this ends in an error: only what was sent matters here.
      await ai.generate({ userId: 'student-1', feature, tier: 'fast', schema, instructions: 'Answer.', prompt: 'Go.' }).catch(() => undefined)
      const sentSchema = asRecord(asRecord(asRecord(claude.sent[0]?.output_config).format).schema)
      const report = shapeReport(sentSchema)

      expect({ feature, refused: report.refused, openObjects: report.openObjects }).toEqual({ feature, refused: [], openObjects: 0 })
      expect(report.unions, feature).toBeLessThanOrEqual(16)
      expect(report.optional, feature).toBeLessThanOrEqual(10)
      expect(sentSchema.type, feature).toBe('object')
    }
  })
})
