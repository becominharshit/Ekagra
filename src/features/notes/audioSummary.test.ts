import { describe, expect, it } from 'vitest'
import { buildTwoHostDialogue, formatDialogueTranscript, stripToSpokenText } from './audioSummary'

describe('2-host audio summary generator', () => {
  it('strips markdown formatting, citations, and inline LaTeX cleanly for speech', () => {
    const spoken = stripToSpokenText('**Ohm law** gives $V = I \\times R$ from [p. 12] and `code`.')
    expect(spoken).toBe('Ohm law gives V = I times R from and code.')
  })

  it('builds an alternating Alex and Maya dialogue covering sections and wrap-up', () => {
    const md = [
      'Relational database design prevents update anomalies.',
      '## First Normal Form',
      '- Every column holds atomic values.',
      '- Eliminate repeating groups across columns.',
      '- Define a primary key for every row.',
      '## BCNF',
      '- Every nontrivial determinant must be a superkey.',
      '- Stronger than 3NF when candidate keys overlap.',
    ].join('\n')

    const turns = buildTwoHostDialogue('Database Normalization', md)
    expect(turns.length).toBeGreaterThanOrEqual(6)
    expect(turns[0]?.speaker).toBe('Alex')
    expect(turns[1]?.speaker).toBe('Maya')
    expect(turns.some((t) => t.heading === 'First Normal Form' && t.text.includes('atomic values'))).toBe(true)
    expect(turns.some((t) => t.heading === 'BCNF' && t.text.includes('superkey'))).toBe(true)
    expect(turns.at(-1)?.speaker).toBe('Maya')

    const transcript = formatDialogueTranscript('Database Normalization', turns)
    expect(transcript).toContain('Database Normalization — 2-Host Audio Summary')
    expect(transcript).toContain('Alex (First Normal Form):')
  })

  it('handles short notes without section headings without returning empty script', () => {
    const turns = buildTwoHostDialogue('Quick Note', 'Remember to check base cases in recursion.')
    expect(turns.length).toBeGreaterThanOrEqual(4)
    expect(turns[1]?.text).toContain('Remember to check base cases in recursion.')
  })
})
