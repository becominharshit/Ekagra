import { describe, expect, it } from 'vitest'
import {
  SAMPLE_OCCLUSION_IMAGE_URL,
  SAMPLE_OCCLUSION_MASKS,
  buildOcclusionCards,
  clampNormalizedBox,
  encodeOcclusionFront,
  occlusionPrompt,
  occlusionSummaryLabel,
  parseOcclusionFront,
} from './occlusion'

describe('Image Occlusion card codec', () => {
  it('round-trips a structured occlusion card cleanly and hides markers from summary labels', () => {
    const encoded = encodeOcclusionFront({
      version: 1,
      prompt: 'Identify the masked stage in the web request flow',
      imageUrl: SAMPLE_OCCLUSION_IMAGE_URL,
      activeMaskIndex: 1,
      masks: SAMPLE_OCCLUSION_MASKS,
    })

    const decoded = parseOcclusionFront(encoded)
    expect(decoded).not.toBeNull()
    expect(decoded?.activeMaskIndex).toBe(1)
    expect(decoded?.masks).toHaveLength(3)
    expect(decoded?.masks[1]?.label).toBe('API Gateway')
    expect(occlusionPrompt(decoded!)).toBe('Identify the masked stage in the web request flow (Region 2 of 3)')
    expect(occlusionSummaryLabel(encoded)).toBe('Identify the masked stage in the web request flow (Region 2 of 3)')
  })

  it('returns null for normal text flashcards and malformed markers', () => {
    expect(parseOcclusionFront('What is BCNF?')).toBeNull()
    expect(parseOcclusionFront('Question <!--ekagra-occlusion:{bad json-->')).toBeNull()
    expect(parseOcclusionFront('Question <!--ekagra-occlusion:{"version":1,"masks":[]}-->')).toBeNull()
    expect(occlusionSummaryLabel('Plain prompt')).toBe('Plain prompt')
  })

  it('clamps normalized coordinates strictly within [0, 1]', () => {
    expect(clampNormalizedBox({ x: -0.2, y: 0.9, width: 0.5, height: 0.4 })).toEqual({
      x: 0,
      y: 0.6,
      width: 0.5,
      height: 0.4,
    })
  })

  it('generates one FSRS card per labeled occlusion box preserving topic and answer', () => {
    const cards = buildOcclusionCards({
      prompt: 'Label the CPU stages',
      imageUrl: SAMPLE_OCCLUSION_IMAGE_URL,
      masks: SAMPLE_OCCLUSION_MASKS,
      topicId: 'topic-os',
    })

    expect(cards).toHaveLength(3)
    expect(cards.map((c) => c.back)).toEqual(['Client Browser', 'API Gateway', 'PostgreSQL'])
    expect(cards.every((c) => c.topic_id === 'topic-os' && c.source === 'manual')).toBe(true)
    expect(parseOcclusionFront(cards[2]!.front)?.activeMaskIndex).toBe(2)
  })
})
