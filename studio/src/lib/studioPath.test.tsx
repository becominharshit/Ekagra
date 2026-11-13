// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { enterDemoModeForTest } from '@/test/renderApp'
import { EmbeddedStudioShell } from '@studio/components/EmbeddedStudioShell'
import { LibraryPage } from '@studio/pages/LibraryPage'
import { studioHref } from './studioHref'
import { StudioLink } from './studioPath'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('studioHref & unified /studio mounting', () => {
  it('resolves paths cleanly for standalone (/) and embedded (/studio) mounts', () => {
    expect(studioHref('', '/')).toBe('/')
    expect(studioHref('', '/subjects/s1')).toBe('/subjects/s1')
    expect(studioHref('/studio', '/')).toBe('/studio')
    expect(studioHref('/studio/', '/subjects/s1')).toBe('/studio/subjects/s1')
    expect(studioHref('/studio', 'notes/n1?t=30')).toBe('/studio/notes/n1?t=30')
  })

  it('renders EmbeddedStudioShell inside main app routing with /studio-prefixed subject links', async () => {
    enterDemoModeForTest()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/studio']}>
          <Routes>
            <Route path="/studio" element={<EmbeddedStudioShell />}>
              <Route index element={<LibraryPage />} />
              <Route
                path="subjects/:subjectId"
                element={
                  <StudioLink to="/" data-testid="back-root">
                    Root
                  </StudioLink>
                }
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Ekagra Studio')).toBeInTheDocument()
    const unfiledLink = screen.getByRole('link', { name: 'No subject' })
    expect(unfiledLink).toHaveAttribute('href', '/studio/unfiled')
  })
})
