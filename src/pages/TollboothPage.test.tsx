// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TollboothPage } from './TollboothPage'
import { enterDemoModeForTest, renderWithRouter } from '@/test/renderApp'

describe('TollboothPage', () => {
  beforeEach(() => {
    localStorage.clear()
    enterDemoModeForTest()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('displays the target app label and starts the Academic Tollbooth quiz', async () => {
    renderWithRouter(<TollboothPage />, ['/today/focus/tollbooth?app=com.instagram.android&label=Instagram'])

    expect(screen.getByRole('heading', { name: /Emergency unlock/i })).toBeInTheDocument()
    expect(screen.getByText(/To open Instagram/i)).toBeInTheDocument()

    const startButton = await screen.findByRole('button', { name: /Answer \d+ questions/i })
    await waitFor(() => expect(startButton).toBeEnabled())

    fireEvent.click(startButton)

    expect(await screen.findByText(/Question 1 of \d+/i)).toBeInTheDocument()
  })
})
