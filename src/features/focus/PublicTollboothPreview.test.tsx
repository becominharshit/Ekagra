// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PublicTollboothPreview } from './PublicTollboothPreview'

describe('PublicTollboothPreview', () => {
  afterEach(() => {
    cleanup()
  })

  it('lets visitors pass an FSRS check and switch to the Code Debug tab without login', () => {
    render(<PublicTollboothPreview />)

    expect(screen.getByRole('heading', { name: /Academic Tollbooth Preview/i })).toBeInTheDocument()

    // Answer FSRS card correctly
    fireEvent.click(screen.getByRole('button', { name: /O\(log n\)/i }))
    expect(screen.getByRole('status')).toHaveTextContent(/Pass earned/i)

    // Switch to Code Debug challenge
    fireEvent.click(screen.getByRole('tab', { name: /Code Debug/i }))
    expect(screen.getByText(/bug here/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /while lo <= hi:/i }))
    expect(screen.getByRole('status')).toHaveTextContent(/Pass earned/i)
  })
})
