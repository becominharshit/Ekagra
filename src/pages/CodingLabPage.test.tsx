// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { demoDb } from '@/lib/demoDb'
import { STARTER_PROBLEMS } from '@/features/coding/problems'
import { CodingLabPage } from './CodingLabPage'
import { enterDemoModeForTest, renderWithRouter } from '@/test/renderApp'

describe('CodingLabPage', () => {
  beforeEach(() => {
    localStorage.clear()
    enterDemoModeForTest()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('renders starter problems action and seeds practice problems into Demo Mode', async () => {
    renderWithRouter(<CodingLabPage />, ['/academics/code'])

    expect(screen.getByRole('heading', { name: 'Coding Lab' })).toBeInTheDocument()

    const seedButton = await screen.findByRole('button', {
      name: new RegExp(`Add ${STARTER_PROBLEMS.length} practice problems`, 'i'),
    })
    fireEvent.click(seedButton)

    await waitFor(() => {
      expect(screen.getByText(new RegExp(`0 of ${STARTER_PROBLEMS.length} solved`, 'i'))).toBeInTheDocument()
    })
  })

  it('allows creating scratch files in JavaScript, TypeScript, and SQL with offline indicator', async () => {
    renderWithRouter(<CodingLabPage />, ['/academics/code'])

    expect(screen.getByText(/JS \/ TS \/ SQL: Always ready offline/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'SQL (PostgreSQL)' }))
    fireEvent.click(screen.getByRole('button', { name: /New file/i }))

    await waitFor(() => {
      const files = demoDb.list('code_snippets')
      expect(files).toHaveLength(1)
      expect(files[0]?.language).toBe('sql')
      expect(files[0]?.code).toContain('CREATE TABLE courses')
    })
  })
})
