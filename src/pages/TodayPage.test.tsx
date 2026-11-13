// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TodayPage } from './TodayPage'
import { enterDemoModeForTest, renderWithRouter } from '@/test/renderApp'

describe('TodayPage', () => {
  beforeEach(() => {
    localStorage.clear()
    enterDemoModeForTest()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('renders daily overview and suggests a quick win when spare time is selected', async () => {
    renderWithRouter(<TodayPage />, ['/today'])

    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByText(/I have a few minutes/i)).toBeInTheDocument()

    const tenMinButton = screen.getByRole('button', { name: '10 min' })
    fireEvent.click(tenMinButton)

    expect(tenMinButton).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByRole('group', { name: 'Spare time' })).toBeInTheDocument()
  })
})
