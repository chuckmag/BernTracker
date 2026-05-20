import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../context/ThemeContext'
import BenchmarksPage from './BenchmarksPage'
import type { BenchmarkSummaryEntry } from '../lib/api'

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      me: {
        ...actual.api.me,
        benchmarks: {
          list: vi.fn(),
          history: vi.fn(),
          logResult: vi.fn(),
          deleteResult: vi.fn(),
        },
      },
    },
  }
})

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Alex' } }),
}))

vi.mock('../components/BenchmarkDetailPanel', () => ({
  default: ({ entry, onClose }: { entry: BenchmarkSummaryEntry; onClose: () => void }) => (
    <div data-testid="benchmark-detail-panel" aria-label={entry.name}>
      <button onClick={onClose}>← Back</button>
    </div>
  ),
}))

const emptyEntry = (overrides: Partial<BenchmarkSummaryEntry> = {}): BenchmarkSummaryEntry => ({
  id: 'nw-1',
  name: 'Fran',
  category: 'GIRL_WOD',
  aliases: [],
  isActive: true,
  description: '21-15-9: Thrusters, Pull-ups',
  sourceUrl: null,
  templateWorkout: {
    id: 'tw-1',
    type: 'FOR_TIME',
    description: '21-15-9: Thrusters (95/65lb), Pull-ups',
    workoutMovements: [],
  },
  manualResultCount: 0,
  latestResult: null,
  ...overrides,
})

const sampleData: BenchmarkSummaryEntry[] = [
  emptyEntry({
    id: 'nw-1',
    name: 'Fran',
    category: 'GIRL_WOD',
    manualResultCount: 3,
    latestResult: {
      id: 'r-1',
      userId: 'u1',
      namedWorkoutName: 'Fran',
      achievedAt: '2026-03-01T00:00:00Z',
      level: 'RX',
      workoutGender: 'MALE',
      value: {},
      notes: null,
      primaryScoreKind: 'TIME',
      primaryScoreValue: 183,
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
    },
  }),
  emptyEntry({
    id: 'nw-2',
    name: 'Grace',
    category: 'GIRL_WOD',
    manualResultCount: 0,
    latestResult: null,
  }),
  emptyEntry({
    id: 'nw-3',
    name: 'Murph',
    category: 'HERO_WOD',
    templateWorkout: {
      id: 'tw-3',
      type: 'FOR_TIME',
      description: '1 mile run, 100 pull-ups…',
      workoutMovements: [],
    },
    manualResultCount: 1,
    latestResult: {
      id: 'r-3',
      userId: 'u1',
      namedWorkoutName: 'Murph',
      achievedAt: '2026-05-01T00:00:00Z',
      level: 'SCALED',
      workoutGender: 'MALE',
      value: {},
      notes: null,
      primaryScoreKind: 'TIME',
      primaryScoreValue: 2460,
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-01T00:00:00Z',
    },
  }),
]

function renderPage() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/wodalytics/benchmarks']}>
        <Routes>
          <Route path="/wodalytics/benchmarks" element={<BenchmarksPage />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('BenchmarksPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('shows empty state when no benchmarks are available', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.benchmarks.list).mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No benchmarks available')).toBeInTheDocument()
  })

  it('renders category tabs and shows the default Girls tab entries', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.benchmarks.list).mockResolvedValue(sampleData)
    renderPage()
    // Tabs for every category are always rendered
    expect(await screen.findByRole('tab', { name: /Girls/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Heroes/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Open/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Games/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Benchmarks/ })).toBeInTheDocument()

    // Default tab is Girls — Fran/Grace visible, Murph (Heroes) hidden
    expect(screen.getByText('Fran')).toBeInTheDocument()
    expect(screen.getByText('Grace')).toBeInTheDocument()
    expect(screen.queryByText('Murph')).not.toBeInTheDocument()
  })

  it('switches active tab to Heroes when clicked, showing only Heroes entries', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.benchmarks.list).mockResolvedValue(sampleData)
    renderPage()
    await screen.findByText('Fran')

    await userEvent.click(screen.getByRole('tab', { name: /Heroes/ }))

    expect(screen.getByText('Murph')).toBeInTheDocument()
    expect(screen.queryByText('Fran')).not.toBeInTheDocument()
    expect(screen.queryByText('Grace')).not.toBeInTheDocument()
  })

  it('marks the active tab with aria-selected', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.benchmarks.list).mockResolvedValue(sampleData)
    renderPage()
    const girlsTab = await screen.findByRole('tab', { name: /Girls/ })
    const heroesTab = screen.getByRole('tab', { name: /Heroes/ })

    expect(girlsTab).toHaveAttribute('aria-selected', 'true')
    expect(heroesTab).toHaveAttribute('aria-selected', 'false')

    await userEvent.click(heroesTab)

    expect(heroesTab).toHaveAttribute('aria-selected', 'true')
    expect(girlsTab).toHaveAttribute('aria-selected', 'false')
  })

  it('shows an empty-tab message for categories with no entries', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.benchmarks.list).mockResolvedValue(sampleData)
    renderPage()
    await screen.findByText('Fran')

    await userEvent.click(screen.getByRole('tab', { name: /^Open/ }))

    expect(screen.getByText(/No benchmarks in Open/)).toBeInTheDocument()
  })

  it('shows formatted TIME score for attempted benchmarks', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.benchmarks.list).mockResolvedValue(sampleData)
    renderPage()
    // Fran: 183s = 3:03 (default Girls tab)
    expect(await screen.findByText('3:03')).toBeInTheDocument()
  })

  it('shows "Not attempted" for benchmarks with no results', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.benchmarks.list).mockResolvedValue(sampleData)
    renderPage()
    await screen.findByText('Fran')
    expect(screen.getByText('Not attempted')).toBeInTheDocument()
  })

  it('shows error message when API fails', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.benchmarks.list).mockRejectedValue(new Error('Network failure'))
    renderPage()
    expect(await screen.findByText('Network failure')).toBeInTheDocument()
  })

  it('renders the search input', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.benchmarks.list).mockResolvedValue(sampleData)
    renderPage()
    await screen.findByText('Fran')
    expect(screen.getByRole('searchbox', { name: 'Search benchmarks' })).toBeInTheDocument()
  })

  it('updates tab counts as the search query filters entries', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.benchmarks.list).mockResolvedValue(sampleData)
    renderPage()
    await screen.findByText('Fran')

    await userEvent.type(screen.getByRole('searchbox'), 'murph')

    // Heroes tab now shows count 1, Girls tab has no entries
    const heroesTab = screen.getByRole('tab', { name: /Heroes/ })
    expect(heroesTab.textContent).toMatch(/1/)
    // Active (Girls) tab now shows the empty-tab message
    expect(screen.getByText(/No benchmarks in Girls/)).toBeInTheDocument()

    // Switching to Heroes reveals Murph
    await userEvent.click(heroesTab)
    expect(screen.getByText('Murph')).toBeInTheDocument()
  })

  it('shows the global no-results message when the query matches nothing across any category', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.benchmarks.list).mockResolvedValue(sampleData)
    renderPage()
    await screen.findByText('Fran')

    await userEvent.type(screen.getByRole('searchbox'), 'zzznomatch')

    expect(screen.getByText(/No benchmarks match/)).toBeInTheDocument()
  })

  it('shows the detail panel when a benchmark card is clicked', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.benchmarks.list).mockResolvedValue(sampleData)
    renderPage()
    await screen.findByText('Fran')

    await userEvent.click(screen.getByText('Fran'))

    expect(screen.getByTestId('benchmark-detail-panel')).toBeInTheDocument()
    expect(screen.getByTestId('benchmark-detail-panel')).toHaveAttribute('aria-label', 'Fran')
  })

  it('returns to the benchmark list when the panel back button is clicked', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.benchmarks.list).mockResolvedValue(sampleData)
    renderPage()
    await screen.findByText('Fran')

    await userEvent.click(screen.getByText('Fran'))
    expect(screen.getByTestId('benchmark-detail-panel')).toBeInTheDocument()

    await userEvent.click(screen.getByText('← Back'))
    expect(screen.queryByTestId('benchmark-detail-panel')).not.toBeInTheDocument()
    expect(screen.getByText('Fran')).toBeInTheDocument()
  })

  it('sorts attempted benchmarks before not-attempted within a category', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.me.benchmarks.list).mockResolvedValue(sampleData)
    renderPage()
    await screen.findByText('Fran')

    const cards = screen.getAllByRole('button').filter((b) => b.textContent?.match(/Fran|Grace/))
    // Fran has results, Grace does not — Fran should come first
    expect(cards[0].textContent).toContain('Fran')
    expect(cards[1].textContent).toContain('Grace')
  })
})
