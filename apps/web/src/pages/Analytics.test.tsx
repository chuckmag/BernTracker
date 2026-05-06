import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../context/ThemeContext'
import Analytics from './Analytics'
import type { ConsistencyData, TrackedMovement, StrengthTrajectoryData } from '../lib/api'

const mockConsistency: ConsistencyData = {
  currentStreak: 5,
  longestStreak: 14,
  history: [
    { date: '2026-05-01', count: 1 },
    { date: '2026-05-02', count: 2 },
  ],
}

const mockMovements: TrackedMovement[] = [
  { movementId: 'mv-1', name: 'Back Squat', count: 8 },
  { movementId: 'mv-2', name: 'Deadlift', count: 5 },
]

const mockTrajectory: StrengthTrajectoryData = {
  movementId: 'mv-1',
  name: 'Back Squat',
  currentPr: 225,
  loadUnit: 'LB',
  points: [
    { date: '2026-02-01', maxLoad: 205, loadUnit: 'LB' },
    { date: '2026-03-01', maxLoad: 215, loadUnit: 'LB' },
    { date: '2026-04-01', maxLoad: 225, loadUnit: 'LB' },
  ],
}

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      me: {
        ...actual.api.me,
        analytics: {
          consistency: vi.fn(),
          trackedMovements: vi.fn(),
          strengthTrajectory: vi.fn(),
        },
      },
    },
  }
})

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Alex', firstName: 'Alex' } }),
}))

function renderAnalytics() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/wodalytics']}>
        <Routes>
          <Route path="/wodalytics" element={<Analytics />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('Analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the page heading', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.analytics.consistency).mockResolvedValue(mockConsistency)
    vi.mocked(api.me.analytics.trackedMovements).mockResolvedValue([])
    renderAnalytics()
    expect(screen.getByText('WODalytics')).toBeInTheDocument()
  })

  it('renders disabled Compare and Export buttons', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.analytics.consistency).mockResolvedValue(mockConsistency)
    vi.mocked(api.me.analytics.trackedMovements).mockResolvedValue([])
    renderAnalytics()
    expect(screen.getByRole('button', { name: 'Compare' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
  })

  it('renders ConsistencyCard after data loads', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.analytics.consistency).mockResolvedValue(mockConsistency)
    vi.mocked(api.me.analytics.trackedMovements).mockResolvedValue([])
    renderAnalytics()
    expect(await screen.findByText('Consistency')).toBeInTheDocument()
  })

  it('shows StrengthPRCard with movement radio buttons when movements are returned', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.analytics.consistency).mockResolvedValue(mockConsistency)
    vi.mocked(api.me.analytics.trackedMovements).mockResolvedValue(mockMovements)
    vi.mocked(api.me.analytics.strengthTrajectory).mockResolvedValue(mockTrajectory)
    renderAnalytics()
    expect(await screen.findByText('Back Squat')).toBeInTheDocument()
    expect(await screen.findByText('Deadlift')).toBeInTheDocument()
  })

  it('shows current PR and improvement chip after trajectory loads', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.analytics.consistency).mockResolvedValue(mockConsistency)
    vi.mocked(api.me.analytics.trackedMovements).mockResolvedValue(mockMovements)
    vi.mocked(api.me.analytics.strengthTrajectory).mockResolvedValue(mockTrajectory)
    renderAnalytics()
    expect(await screen.findByText(/225 LB/)).toBeInTheDocument()
    expect(await screen.findByText(/\+20 LB/)).toBeInTheDocument()
  })

  it('shows an error message when the API call fails', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.analytics.consistency).mockRejectedValue(new Error('Network error'))
    vi.mocked(api.me.analytics.trackedMovements).mockRejectedValue(new Error('Network error'))
    renderAnalytics()
    expect(await screen.findByText('Network error')).toBeInTheDocument()
  })
})
