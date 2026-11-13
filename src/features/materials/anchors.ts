import { useQuery } from '@tanstack/react-query'
import {
  TutorResponseSchema,
  type AnchorAction,
  type SourceCitation,
  type TutorRequest,
  type TutorResponse,
} from '@shared/schemas.ts'
import { academicsKey } from '@/features/academics/subjects'
import { callAiFunction, streamAiFunction } from '@/features/ai/aiClient'
import { demoTutor } from '@/features/ai/demoAi'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Tables, TablesInsert } from '@/types/database'
import type { Material } from './materials'
import type { PageRect } from './selection'

// AI Anchors: an AI answer saved at the spot of a PDF page it is about. "Ask about this page"
// answers are anchors too (action "ask"), so all of a page's AI help is in one list.

export type Anchor = Tables<'ai_anchors'>

export const ACTION_LABEL: Record<AnchorAction, string> = {
  explain: 'Explain',
  simplify: 'Simplify',
  example: 'Example',
  flashcards: 'Flashcards',
  ask: 'Ask',
}

/** Signed in: SSE streaming via ai-tutor (Fast model). Demo Mode: a sample made from the page. */
export async function askTutorStream(
  source: DataSource,
  request: TutorRequest,
  options?: {
    onDelta?: (delta: { answerMd: string; citations: SourceCitation[] }) => void
    signal?: AbortSignal
  },
): Promise<TutorResponse> {
  if (source.kind === 'demo') {
    const sample = demoTutor(request)
    options?.onDelta?.({ answerMd: sample.answerMd, citations: sample.citations ?? [] })
    return sample
  }
  return streamAiFunction('ai-tutor', request, {
    schema: TutorResponseSchema,
    signal: options?.signal,
    onDelta: (partial) => {
      const obj = partial as Record<string, unknown>
      const answerMd = typeof obj.answerMd === 'string' ? obj.answerMd : ''
      const citations = Array.isArray(obj.citations) ? (obj.citations as SourceCitation[]) : []
      options?.onDelta?.({ answerMd, citations })
    },
  })
}

/** Non-streaming tutor fallback (keeps JSON compatibility for non-streaming callers/tests). */
export async function askTutor(source: DataSource, request: TutorRequest): Promise<TutorResponse> {
  if (source.kind === 'demo') return demoTutor(request)
  return callAiFunction('ai-tutor', request, TutorResponseSchema)
}

export async function listAnchors(source: DataSource, materialId: string): Promise<Anchor[]> {
  if (source.kind === 'demo') {
    return demoDb
      .list('ai_anchors')
      .filter((anchor) => anchor.material_id === materialId)
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  }
  const { data, error } = await source.client
    .from('ai_anchors')
    .select('*')
    .eq('user_id', source.userId)
    .eq('material_id', materialId)
    .order('created_at')
  if (error) throw dbError(error)
  return data
}

export interface NewAnchor {
  material: Material
  request: TutorRequest
  rect: PageRect | null
  onDelta?: (delta: { answerMd: string; citations: SourceCitation[] }) => void
  signal?: AbortSignal
}

/** Asks the tutor (streaming over SSE when interactive callbacks/signal are given) and saves the answer as an anchor. */
export async function createAnchor(source: DataSource, { material, request, rect, onDelta, signal }: NewAnchor): Promise<{ anchor: Anchor; cardCount: number }> {
  const answer =
    onDelta || signal
      ? await askTutorStream(source, request, { onDelta, signal })
      : await askTutor(source, request)
  const anchor: TablesInsert<'ai_anchors'> = {
    id: crypto.randomUUID(),
    material_id: material.id,
    page_no: request.pageNumber,
    selected_text: request.selectedText?.trim() || null,
    rect: rect ? { ...rect } : null,
    action: request.action,
    question: request.question?.trim() || null,
    response_md: answer.answerMd,
    model: answer.model,
    prompt_version: answer.promptVersion,
  }
  const cards: TablesInsert<'flashcards'>[] = answer.flashcards.map((card) => ({
    front: card.front,
    back: card.back,
    source: 'anchor',
    anchor_id: anchor.id,
    material_id: material.id,
  }))

  if (source.kind === 'demo') {
    const [saved] = demoDb.insert('ai_anchors', [anchor])
    demoDb.insert('flashcards', cards)
    if (!saved) throw new Error('The answer was not saved.')
    return { anchor: saved, cardCount: cards.length }
  }
  const { data, error } = await source.client.from('ai_anchors').insert(anchor).select().single()
  if (error) throw dbError(error)
  if (cards.length > 0) {
    const saved = await source.client.from('flashcards').insert(cards)
    if (saved.error) throw dbError(saved.error)
  }
  return { anchor: data, cardCount: cards.length }
}

export async function deleteAnchor(source: DataSource, anchorId: string): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.remove('ai_anchors', [anchorId])
    return
  }
  const { error } = await source.client.from('ai_anchors').delete().eq('id', anchorId)
  if (error) throw dbError(error)
}

export function useAnchors(materialId: string | undefined) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'anchors', materialId],
    queryFn: () => listAnchors(need(source), materialId ?? ''),
    enabled: source !== null && Boolean(materialId),
  })
}
