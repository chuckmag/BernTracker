import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../context/ThemeContext'
import Analytics from './Analytics'
import type { ConsistencyData } from '../lib/api'

const mockConsistency: ConsistencyData = {
  currentStreak: 5,
  longestStreak: 14,
  history: [
    { date: '2026-05-01', count: 1 },
    { date: '2026-05-02', count: 2 },
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
      <MemoryRouter initialEntries={['/analytics']}>
        <Routes>
          <Route path="/analytics" element={<Analytics />} />
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
    renderAnalytics()
    expect(screen.getByText('WODalytics')).toBeInTheDocument()
  })

  it('renders disabled Compare and Export buttons', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.analytics.consistency).mockResolvedValue(mockConsistency)
    renderAnalytics()
    expect(screen.getByRole('button', { name: 'Compare' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
  })

  it('renders ConsistencyCard after data loads', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.analytics.consistency).mockResolvedValue(mockConsistency)
    renderAnalytics()
    expect(await screen.findByText('Consistency')).toBeInTheDocument()
  })

  it('shows an error message when the API call fails', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.analytics.consistency).mockRejectedValue(new Error('Network error'))
    renderAnalytics()
    expect(await screen.findByText('Network error')).toBeInTheDocument()
  })
})
