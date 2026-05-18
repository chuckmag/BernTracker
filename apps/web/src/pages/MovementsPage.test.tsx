import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../context/ThemeContext'
import MovementsPage from './MovementsPage'
import type { MovementsAnalyticsData } from '../lib/api'

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      me: {
        ...actual.api.me,
        analytics: {
          movements: vi.fn(),
          movementPrs: vi.fn(),
          movementTrajectory: vi.fn(),
        },
      },
    },
  }
})

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Alex' } }),
}))

vi.mock('../components/MovementDetailDrawer', () => ({
  default: ({ name, onClose }: { name: string; onClose: () => void }) => (
    <div data-testid="movement-detail-drawer" aria-label={name}>
      <button onClick={onClose}>Close</button>
    </div>
  ),
}))

const emptyData: MovementsAnalyticsData = { strength: [], monostructural: [], gymnastics: [] }

const sampleData: MovementsAnalyticsData = {
  strength: [
    {
      movementId: 'mv-1',
      name: 'Back Squat',
      prTypes: ['LOAD'],
      primaryPR: { type: 'LOAD', reps: 1, load: 225, loadUnit: 'LB', achievedAt: '2026-04-01T00:00:00Z' },
      lastLoggedAt: '2026-04-01T00:00:00Z',
    },
    {
      movementId: 'mv-2',
      name: 'Deadlift',
      prTypes: ['LOAD'],
      primaryPR: null,
      lastLoggedAt: '2026-03-15T00:00:00Z',
    },
  ],
  monostructural: [
    {
      movementId: 'mv-3',
      name: 'Row',
      prTypes: ['DISTANCE', 'CALORIES', 'TIME'],
      primaryPR: { type: 'DISTANCE', seconds: 120, distance: 500, distanceUnit: 'M', achievedAt: '2026-03-01T00:00:00Z' },
      lastLoggedAt: '2026-03-01T00:00:00Z',
    },
  ],
  gymnastics: [],
}

function renderPage() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/wodalytics/movements']}>
        <Routes>
          <Route path="/wodalytics/movements" element={<MovementsPage />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('MovementsPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('shows empty state when no movements are logged', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.analytics.movements).mockResolvedValue(emptyData)
    renderPage()
    expect(await screen.findByText('No movements logged yet')).toBeInTheDocument()
  })

  it('renders movement cards grouped under their category heading', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.analytics.movements).mockResolvedValue(sampleData)
    renderPage()
    expect(await screen.findByText('Strength')).toBeInTheDocument()
    expect(await screen.findByText('Monostructural')).toBeInTheDocument()
    expect(screen.getByText('Back Squat')).toBeInTheDocument()
    expect(screen.getByText('Deadlift')).toBeInTheDocument()
    expect(screen.getByText('Row')).toBeInTheDocument()
  })

  it('hides the Gymnastics section when it has no entries', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.analytics.movements).mockResolvedValue(sampleData)
    renderPage()
    await screen.findByText('Strength')
    expect(screen.queryByText('Gymnastics')).not.toBeInTheDocument()
  })

  it('shows formatted primary PR for a LOAD movement', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.analytics.movements).mockResolvedValue(sampleData)
    renderPage()
    expect(await screen.findByText('225 LB × 1')).toBeInTheDocument()
  })

  it('shows "No PR recorded" for a movement with null primaryPR', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.analytics.movements).mockResolvedValue(sampleData)
    renderPage()
    await screen.findByText('Deadlift')
    expect(screen.getByText('No PR recorded')).toBeInTheDocument()
  })

  it('shows error message when API fails', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.analytics.movements).mockRejectedValue(new Error('Network failure'))
    renderPage()
    expect(await screen.findByText('Network failure')).toBeInTheDocument()
  })
})
