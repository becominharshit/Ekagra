// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enterDemoModeForTest, renderWithRouter } from '@/test/renderApp'

const mockState = vi.hoisted(() => ({
  addMaterial: vi.fn(async () => {
    throw new Error('Paste a valid YouTube link.')
  }),
}))

vi.mock('./library', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./library')>()
  return {
    ...actual,
    addMaterial: mockState.addMaterial,
  }
})

const { AddMaterialDialog } = await import('./AddMaterialDialog')

describe('Studio AddMaterialDialog error clearing', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    enterDemoModeForTest()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('clears validation and mutation errors whenever switching between File/Photo, YouTube, and Text tabs', async () => {
    renderWithRouter(<AddMaterialDialog open onOpenChange={vi.fn()} subjectId={null} />)

    fireEvent.click(screen.getByRole('radio', { name: /YouTube/i }))
    fireEvent.change(screen.getByLabelText(/Link to the video/i), { target: { value: 'https://invalid.example' } })
    fireEvent.click(screen.getByRole('button', { name: /Add the video/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Paste a valid YouTube link.')

    fireEvent.click(screen.getByRole('radio', { name: /Text/i }))
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull()
    })

    fireEvent.click(screen.getByRole('radio', { name: /File or photo/i }))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
