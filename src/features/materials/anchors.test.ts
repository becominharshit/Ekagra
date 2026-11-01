import { describe, expect, it } from 'vitest'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { createAnchor, deleteAnchor, listAnchors } from './anchors'
import type { Material } from './materials'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }
const PAGE_TEXT = 'Normalization removes redundancy from tables. A relation is in BCNF when every determinant is a superkey.'

function addMaterial(): Material {
  const [material] = demoDb.insert('materials', [{ kind: 'pdf', title: 'DBMS notes', page_count: 120, status: 'ready' }])
  if (!material) throw new Error('no material')
  return material
}

describe('AI Anchors (Demo Mode)', () => {
  it('saves the answer at the selected spot of the page', async () => {
    const material = addMaterial()
    const { anchor, cardCount } = await createAnchor(DEMO, {
      material,
      rect: { x: 0.1, y: 0.2, w: 0.5, h: 0.05 },
      request: { action: 'explain', selectedText: 'every determinant is a superkey', pageText: PAGE_TEXT, pageNumber: 42, materialTitle: 'DBMS notes' },
    })
    expect(anchor).toMatchObject({ material_id: material.id, page_no: 42, action: 'explain', rect: { x: 0.1, y: 0.2, w: 0.5, h: 0.05 }, model: 'demo' })
    expect(anchor.response_md).toContain('BCNF')
    expect(cardCount).toBe(0)
    expect(await listAnchors(DEMO, material.id)).toEqual([anchor])
  })

  it('makes flashcards linked to the anchor, and keeps them when the anchor is deleted', async () => {
    const material = addMaterial()
    const { anchor, cardCount } = await createAnchor(DEMO, {
      material,
      rect: null,
      request: { action: 'flashcards', selectedText: PAGE_TEXT, pageText: PAGE_TEXT, pageNumber: 42, materialTitle: 'DBMS notes' },
    })
    const cards = demoDb.list('flashcards')
    expect(cards).toHaveLength(cardCount)
    expect(cardCount).toBeGreaterThan(0)
    expect(cards[0]).toMatchObject({ source: 'anchor', anchor_id: anchor.id, material_id: material.id })

    await deleteAnchor(DEMO, anchor.id)
    expect(await listAnchors(DEMO, material.id)).toEqual([])
    expect(demoDb.list('flashcards')[0]).toMatchObject({ anchor_id: null, material_id: material.id })
  })

  it('saves "Ask about this page" answers as anchors with the question', async () => {
    const material = addMaterial()
    const { anchor } = await createAnchor(DEMO, {
      material,
      rect: null,
      request: { action: 'ask', question: 'What is BCNF?', pageText: PAGE_TEXT, pageNumber: 3, materialTitle: 'DBMS notes' },
    })
    expect(anchor).toMatchObject({ action: 'ask', question: 'What is BCNF?', selected_text: null, page_no: 3 })
  })
})
