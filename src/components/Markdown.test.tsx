// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NoteBody } from '@/features/notes/NoteBody'
import { Markdown } from './Markdown'

describe('Markdown LaTeX & TOC rendering', () => {
  it('sanitizes common LLM LaTeX typos (\\mur -> \\mu_r) and renders KaTeX markup without parse errors', () => {
    const { container } = render(<Markdown>{'Relative permeability is $\\mur$ and $\\mu0$.'}</Markdown>)
    expect(container.querySelector('.katex')).not.toBeNull()
    expect(container.querySelector('.katex-error')).toBeNull()
    expect(container.textContent).toContain('μ')
  })

  it('supports inline mode without wrapping in block paragraph tags', () => {
    const { container } = render(<Markdown inline>{'Flux $\\Phi_E$'}</Markdown>)
    expect(container.querySelector('p')).toBeNull()
    expect(container.querySelector('.katex')).not.toBeNull()
  })

  it('renders Table of Contents math headings with KaTeX instead of raw $...$ strings and matches section ids', () => {
    const content = [
      '## Permeability $\\mur$ basics',
      'Body 1',
      '## Gauss Law $\\Phi_E$',
      'Body 2',
      '## Summary $B_0$',
      'Body 3',
    ].join('\n\n')

    const { container } = render(<NoteBody kind="notes" title="Magnetism" content={content} />)
    const tocBtn = screen.getByRole('button', { name: /Contents \(3\)/i })
    fireEvent.click(tocBtn)

    const nav = container.querySelector('nav[aria-label="Note sections"]')
    expect(nav).not.toBeNull()
    expect(nav?.querySelector('.katex')).not.toBeNull()
    expect(nav?.textContent).not.toContain('$')
    expect(container.querySelector('h2#sec-permeability-mu-r-basics')).not.toBeNull()
  })
})
