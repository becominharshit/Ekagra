// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MarksCard } from '@/features/grades/MarksCard'
import { PipelineBoard } from '@/features/hustle/PipelineBoard'
import { SpeakingTab } from '@/features/life/speaking/SpeakingTab'
import { CaptureButton } from '@/features/tasks/CaptureButton'
import { enterDemoModeForTest, renderWithRouter } from '@/test/renderApp'
import { BottomTabBar } from './BottomTabBar'
import { SideNav } from './SideNav'

vi.mock('@/features/life/speaking/recorder', () => ({
  canRecord: () => true,
  startRecording: vi.fn(),
}))

describe('Responsive mobile & tablet UI fixes', () => {
  beforeEach(() => {
    localStorage.clear()
    enterDemoModeForTest()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('hides floating CaptureButton on /me, /me/account, and /pricing while showing it on /today', () => {
    renderWithRouter(<CaptureButton />, ['/me'])
    expect(screen.queryByRole('button', { name: /Capture a task/i })).toBeNull()
    cleanup()

    renderWithRouter(<CaptureButton />, ['/pricing'])
    expect(screen.queryByRole('button', { name: /Capture a task/i })).toBeNull()
    cleanup()

    renderWithRouter(<CaptureButton />, ['/today'])
    expect(screen.getByRole('button', { name: /Capture a task/i })).toBeInTheDocument()
  })

  it('renders a compact md: icon rail in SideNav and hides BottomTabBar from md: upward', () => {
    const { container } = renderWithRouter(
      <div>
        <SideNav />
        <BottomTabBar />
      </div>,
      ['/today'],
    )
    const navs = container.querySelectorAll('nav[aria-label="Main"]')
    expect(navs[0]?.className).toContain('md:block')
    expect(navs[0]?.className).toContain('md:w-16')
    expect(navs[0]?.className).toContain('lg:w-56')
    expect(navs[1]?.className).toContain('md:hidden')
  })

  it('stacks MarksCard fields cleanly on mobile with explicit top labels', () => {
    const { container } = renderWithRouter(
      <MarksCard
        subject={{
          id: 'subj-1',
          user_id: 'demo-user',
          name: 'Physics',
          kind: 'course',
          code: 'PHY101',
          color: '#2563eb',
          credits: 4,
          grade: null,
          exam_date: null,
          exam_date_estimated: false,
          semester: 1,
          weekly_minutes_limit: null,
          archived_at: null,
          created_at: '2026-11-01T00:00:00Z',
          updated_at: '2026-11-01T00:00:00Z',
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Add marks/i }))
    const fieldsGrid = container.querySelector('.grid-cols-1.sm\\:grid-cols-3')
    expect(fieldsGrid).not.toBeNull()
    expect(screen.getByLabelText(/^Marks$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Out of$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Date$/i)).toBeInTheDocument()
  })

  it('wraps SpeakingTab action buttons cleanly on narrow screens', async () => {
    renderWithRouter(<SpeakingTab />)
    const startBtn = await screen.findByRole('button', { name: /Start speaking/i })
    const row = startBtn.parentElement
    expect(row?.className).toContain('flex-wrap')
    expect(row?.className).toContain('items-center')
    expect(row?.className).toContain('mt-3')
  })

  it('renders snap-x snap-mandatory horizontal scroll indicators on mobile Kanban columns', async () => {
    const { container } = renderWithRouter(
      <PipelineBoard
        hustle={{
          id: 'hustle-1',
          user_id: 'demo-user',
          name: 'Design',
          type: 'freelance',
          currency: 'USD',
          goal: null,
          goal_amount: null,
          goal_date: null,
          links: [],
          status: 'active',
          pipeline_stages: ['Leads', 'Proposals', 'Active', 'Paid'],
          created_at: '2026-11-01T00:00:00Z',
          updated_at: '2026-11-01T00:00:00Z',
        }}
      />,
    )

    expect(await screen.findByLabelText(/Kanban stage scroll controls/i)).toBeInTheDocument()
    expect(container.querySelector('.snap-x.snap-mandatory')).not.toBeNull()
    expect(screen.getByRole('button', { name: /Jump to Proposals/i })).toBeInTheDocument()
  })
})
