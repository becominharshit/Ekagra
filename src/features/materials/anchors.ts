import { useQuery } from '@tanstack/react-query'
import { TutorResponseSchema, type AnchorAction, type TutorRequest, type TutorResponse } from '@shared/schemas.ts'
import { academicsKey } from '@/features/academics/subjects'
import { callAiFunction } from '@/features/ai/aiClient'
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

/** Signed in: the ai-tutor Edge Function (Fast model). Demo Mode: a sample made from the page. */
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
}

/** Asks the tutor and saves the answer as an anchor (and its flashcards, for that action). */
export async function createAnchor(source: DataSource, { material, request, rect }: NewAnchor): Promise<{ anchor: Anchor; cardCount: number }> {
  const answer = await askTutor(source, request)
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
