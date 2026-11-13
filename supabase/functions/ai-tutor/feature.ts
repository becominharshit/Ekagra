import { createAiGateway } from '../_shared/ai.ts'
import { AiError, readAiConfig } from '../_shared/aiCore.ts'
import type { AiFeature, ServerDeps } from '../_shared/http.ts'
import { TUTOR_PROMPT_VERSION, tutorInstructions, tutorPrompt } from '../_shared/prompts/tutor.ts'
import {
  formatSseEvent,
  readBody,
  requireUser,
  runWithCorsAndErrors,
  sseHeaders,
} from '../_shared/respond.ts'
import {
  TutorAnswerSchema,
  TutorRequestSchema,
  type SourceCitation,
  type TutorRequest,
  type TutorResponse,
} from '../_shared/schemas.ts'

export function buildTutorResponse(
  input: TutorRequest,
  data: { answerMd: string; flashcards: TutorResponse['flashcards']; citations?: SourceCitation[] },
  model: string,
): TutorResponse {
  return {
    answerMd: data.answerMd,
    flashcards: input.action === 'flashcards' ? data.flashcards : [],
    citations: data.citations ?? [],
    model,
    promptVersion: TUTOR_PROMPT_VERSION,
  }
}

function acceptsJsonOnly(request: Request): boolean {
  const accept = request.headers.get('accept')?.toLowerCase() ?? ''
  return accept.includes('application/json') && !accept.includes('text/event-stream')
}

/** 1-click AI Anchors (explain, simplify, example, flashcards) and "Ask about this page". */
export const tutorFeature: AiFeature<TutorRequest, TutorResponse> = {
  feature: 'tutor',
  input: TutorRequestSchema,
  async run({ input, userId, ai }) {
    const { data, model } = await ai.generate({
      userId,
      // Shows in ai_usage whether the cost came from anchors or from questions.
      feature: input.action === 'ask' ? 'tutor' : 'anchor',
      tier: 'fast',
      schema: TutorAnswerSchema,
      instructions: tutorInstructions(input),
      prompt: tutorPrompt(input),
    })
    return buildTutorResponse(input, data, model)
  },
}

/** HTTP handler for ai-tutor: SSE token-by-token streaming by default, or JSON if Accept: application/json is sent. */
export function handleTutorRequest(depsFactory: () => ServerDeps): (request: Request) => Promise<Response> {
  return (request) =>
    runWithCorsAndErrors(
      request,
      () => depsFactory().env,
      async (env) => {
        const { env: fnEnv, authenticate, usage, model } = depsFactory()
        const userId = await requireUser(authenticate, request)
        const input = await readBody(request, TutorRequestSchema)
        const ai = createAiGateway({ config: readAiConfig(fnEnv), usage, model })
        const task = {
          userId,
          feature: input.action === 'ask' ? 'tutor' : 'anchor',
          tier: 'fast' as const,
          schema: TutorAnswerSchema,
          instructions: tutorInstructions(input),
          prompt: tutorPrompt(input),
        }

        if (acceptsJsonOnly(request)) {
          const { data, model: usedModel } = await ai.generate(task)
          return new Response(JSON.stringify(buildTutorResponse(input, data, usedModel)), {
            status: 200,
            headers: {
              ...(await import('../_shared/respond.ts')).corsHeadersFor(request, env ?? fnEnv),
              'Content-Type': 'application/json',
            },
          })
        }

        await ai.ensureQuota(userId)

        const encoder = new TextEncoder()
        let closed = false
        let lastSnapshot = ''
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const send = (event: string, data: unknown) => {
              if (closed) return
              try {
                controller.enqueue(encoder.encode(formatSseEvent(event, data)))
              } catch {
                closed = true
              }
            }
            send('status', { stage: 'streaming' })
            try {
              const { data, model: usedModel } = await ai.stream({
                ...task,
                onPartial: (partial) => {
                  if (!partial || typeof partial !== 'object') return
                  const obj = partial as Record<string, unknown>
                  const deltaPayload = {
                    answerMd: typeof obj.answerMd === 'string' ? obj.answerMd : '',
                    flashcards:
                      input.action === 'flashcards' && Array.isArray(obj.flashcards) ? obj.flashcards : [],
                    citations: Array.isArray(obj.citations) ? obj.citations : [],
                  }
                  const snapshot = JSON.stringify(deltaPayload)
                  if (snapshot !== lastSnapshot) {
                    lastSnapshot = snapshot
                    send('delta', deltaPayload)
                  }
                },
              })
              send('done', buildTutorResponse(input, data, usedModel))
            } catch (error) {
              if (error instanceof AiError) {
                send('error', { code: error.code, message: error.message })
              } else {
                console.error(error)
                send('error', {
                  code: 'server_error',
                  message: 'Something went wrong on the server. Please try again.',
                })
              }
            } finally {
              if (!closed) {
                closed = true
                try {
                  controller.close()
                } catch {
                  // stream already closed
                }
              }
            }
          },
          cancel() {
            closed = true
          },
        })

        return new Response(stream, {
          status: 200,
          headers: sseHeaders(request, env ?? fnEnv),
        })
      },
    )
}
