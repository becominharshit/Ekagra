import { describe, expect, it } from 'vitest'
import { countNodes, parseOutline, plainLabel, type OutlineNode } from './outline'

/** The tree as nested labels, easier to read in a test: [label, [children]]. */
type Shape = [string, Shape[]]
const shape = (node: OutlineNode): Shape => [node.label, node.children.map(shape)]

describe('parseOutline', () => {
  it('puts the first "#" heading in the centre, with headings and nested lists below it', () => {
    const tree = parseOutline(
      ['# Normalization', '', '## Why', '- Less repetition', '- No update anomalies', '## Normal forms', '- 1NF', '  - Atomic values', '- 2NF', '- BCNF'].join('\n'),
      'DBMS notes',
    )
    expect(shape(tree)).toEqual([
      'Normalization',
      [
        ['Why', [['Less repetition', []], ['No update anomalies', []]]],
        ['Normal forms', [['1NF', [['Atomic values', []]]], ['2NF', []], ['BCNF', []]]],
      ],
    ])
    expect(countNodes(tree)).toBe(8)
  })

  it('works with lists only, any indentation (2 or 4 spaces, tabs) and numbered items', () => {
    const tree = parseOutline(['- Sorting', '    - Merge sort', '        1. Split', '        2. Merge', '- Searching', '\t- Binary search'].join('\n'), 'Algorithms')
    expect(shape(tree)).toEqual([
      'Algorithms',
      [
        ['Sorting', [['Merge sort', [['Split', []], ['Merge', []]]]]],
        ['Searching', [['Binary search', []]]],
      ],
    ])
  })

  it('uses the note title when there is no "#" heading, and a later "#" heading as a branch', () => {
    expect(shape(parseOutline('## Ohm’s law\n- V = IR', 'Circuits'))).toEqual(['Circuits', [['Ohm’s law', [['V = IR', []]]]]])
    expect(shape(parseOutline('# Physics\n# Optics\n- Lenses', 'x'))).toEqual(['Physics', [['Optics', [['Lenses', []]]]]])
  })

  it('goes back up when a heading or list is shallower than the one before', () => {
    const tree = parseOutline(['# OS', '### Deep first', '- Point', '## Processes', '- PCB', '    - Registers', '- States'].join('\n'), 'x')
    expect(shape(tree)).toEqual([
      'OS',
      [
        ['Deep first', [['Point', []]]],
        ['Processes', [['PCB', [['Registers', []]]], ['States', []]]],
      ],
    ])
  })

  it('keeps plain lines and quotes as points, and skips code, rules and empty lines', () => {
    const tree = parseOutline(['# Python', 'Lists are mutable.', '> Tuples are not.', '---', '```', '- not a point', '```', '', '- Sets'].join('\n'), 'x')
    expect(shape(tree)).toEqual(['Python', [['Lists are mutable.', []], ['Tuples are not.', []], ['Sets', []]]])
  })

  it('gives an empty tree for empty notes', () => {
    expect(shape(parseOutline('', 'Untitled'))).toEqual(['Untitled', []])
    expect(shape(parseOutline('#   \n- **  **', 'Untitled'))).toEqual(['Untitled', []])
  })
})

describe('plainLabel', () => {
  it('drops Markdown marks but keeps the words', () => {
    expect(plainLabel('**Primary key**: unique and *not null*')).toBe('Primary key: unique and not null')
    expect(plainLabel('Use `SELECT` with [joins](https://example.com)')).toBe('Use SELECT with joins')
    expect(plainLabel('[x] Revise  __ACID__ ##')).toBe('Revise ACID')
    expect(plainLabel('snake_case and a * b')).toBe('snake_case and a * b')
  })

  it('keeps LaTeX formulas whole, so the mind map can draw them', () => {
    expect(plainLabel('$c = \\frac{1}{\\sqrt{\\mu_0 \\varepsilon_0}}$')).toBe('$c = \\frac{1}{\\sqrt{\\mu_0 \\varepsilon_0}}$')
    expect(shape(parseOutline('# Waves\n## Formulas\n- $c = \\frac{1}{\\sqrt{\\mu_0 \\varepsilon_0}}$', 'x'))).toEqual([
      'Waves',
      [['Formulas', [['$c = \\frac{1}{\\sqrt{\\mu_0 \\varepsilon_0}}$', []]]]],
    ])
  })
})
