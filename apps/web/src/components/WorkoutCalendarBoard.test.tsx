import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import WorkoutCalendarBoard from './WorkoutCalendarBoard'
import { makePersonalProgramScope } from '../lib/personalProgramScope'

// Drawer renders a heavy form with API + context dependencies that aren't
// relevant to the responsive-switch tests. Mock it to a sentinel so each
// test only exercises the calendar surface choice.
vi.mock('./WorkoutDrawer', () => ({
  default: ({ dateKey }: { dateKey: string | null }) => (
    <div data-testid="mock-drawer" data-open={dateKey ? 'true' : 'false'} />
  ),
}))

vi.mock('../lib/api', () => ({
  api: {},
  TYPE_ABBR: {
    STRENGTH: 'S', FOR_TIME: 'F', EMOM: 'E', CARDIO: 'C',
    AMRAP: 'A', METCON: 'M', WARMUP: 'W',
  },
}))

const personalScope = makePersonalProgramScope({
  program: { id: 'pp-1', name: 'Personal Program', visibility: 'PRIVATE', ownerUserId: 'u-1', _count: { workouts: 0 } } as never,
})

function mockMatchMediaMatches(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn(() => ({
      matches,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

describe('WorkoutCalendarBoard responsive switch', () => {
  beforeEach(() => {
    mockMatchMediaMatches(false)
  })

  it('renders the month grid (Sun/Sat day headers) at desktop width', async () => {
    mockMatchMediaMatches(false)
    const loadWorkouts = vi.fn().mockResolvedValue([])
    render(
      <WorkoutCalendarBoard loadWorkouts={loadWorkouts} scope={personalScope} userGymRole="OWNER" />,
    )
    await waitFor(() => expect(loadWorkouts).toHaveBeenCalled())
    expect(screen.getByText('Sun')).toBeInTheDocument()
    expect(screen.getByText('Sat')).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-day-strip')).not.toBeInTheDocument()
  })

  it('renders the day strip (no Sun/Sat headers) at narrow width', async () => {
    mockMatchMediaMatches(true)
    const loadWorkouts = vi.fn().mockResolvedValue([])
    render(
      <WorkoutCalendarBoard loadWorkouts={loadWorkouts} scope={personalScope} userGymRole="OWNER" />,
    )
    await waitFor(() => expect(loadWorkouts).toHaveBeenCalled())
    expect(screen.getByTestId('calendar-day-strip')).toBeInTheDocument()
    expect(screen.queryByText('Sun')).not.toBeInTheDocument()
    expect(screen.queryByText('Sat')).not.toBeInTheDocument()
  })

  it('queries a 3-day window when narrow vs a full month when wide', async () => {
    mockMatchMediaMatches(true)
    const narrowLoad = vi.fn().mockResolvedValue([])
    const { unmount } = render(
      <WorkoutCalendarBoard loadWorkouts={narrowLoad} scope={personalScope} />,
    )
    await waitFor(() => expect(narrowLoad).toHaveBeenCalled())
    const [from, to] = narrowLoad.mock.calls[0]
    const spanDays = (new Date(to as string).getTime() - new Date(from as string).getTime()) / (1000 * 60 * 60 * 24)
    expect(spanDays).toBeGreaterThan(2.9)
    expect(spanDays).toBeLessThan(3)

    unmount()

    mockMatchMediaMatches(false)
    const wideLoad = vi.fn().mockResolvedValue([])
    render(<WorkoutCalendarBoard loadWorkouts={wideLoad} scope={personalScope} />)
    await waitFor(() => expect(wideLoad).toHaveBeenCalled())
    const [wideFrom, wideTo] = wideLoad.mock.calls[0]
    const wideSpanDays =
      (new Date(wideTo as string).getTime() - new Date(wideFrom as string).getTime()) / (1000 * 60 * 60 * 24)
    expect(wideSpanDays).toBeGreaterThan(27.9)
    expect(wideSpanDays).toBeLessThan(31)
  })

  it('hides the Today button on the month grid while viewing the current month', async () => {
    mockMatchMediaMatches(false)
    const loadWorkouts = vi.fn().mockResolvedValue([])
    render(<WorkoutCalendarBoard loadWorkouts={loadWorkouts} scope={personalScope} />)
    await waitFor(() => expect(loadWorkouts).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument()
  })

  it('reveals the Today button on the month grid after paging away, then jumps back on click', async () => {
    mockMatchMediaMatches(false)
    const loadWorkouts = vi.fn().mockResolvedValue([])
    render(<WorkoutCalendarBoard loadWorkouts={loadWorkouts} scope={personalScope} />)
    await waitFor(() => expect(loadWorkouts).toHaveBeenCalled())
    // Step forward one month — now viewing a non-current month.
    fireEvent.click(screen.getByLabelText('Next month'))
    const todayBtn = await screen.findByRole('button', { name: 'Today' })
    fireEvent.click(todayBtn)
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument()
    })
  })

  it('hides the Today button on the strip while today is in the visible window', async () => {
    mockMatchMediaMatches(true)
    const loadWorkouts = vi.fn().mockResolvedValue([])
    render(<WorkoutCalendarBoard loadWorkouts={loadWorkouts} scope={personalScope} />)
    await waitFor(() => expect(loadWorkouts).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument()
  })

  it('reveals the Today button on the strip after paging away, then jumps back on click', async () => {
    mockMatchMediaMatches(true)
    const loadWorkouts = vi.fn().mockResolvedValue([])
    render(<WorkoutCalendarBoard loadWorkouts={loadWorkouts} scope={personalScope} />)
    await waitFor(() => expect(loadWorkouts).toHaveBeenCalled())
    fireEvent.click(screen.getByLabelText('Next days'))
    const todayBtn = await screen.findByRole('button', { name: 'Today' })
    fireEvent.click(todayBtn)
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument()
    })
  })
})
