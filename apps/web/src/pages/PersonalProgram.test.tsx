import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import PersonalProgram from './PersonalProgram'
import type { PersonalProgram as PersonalProgramType } from '../lib/api'

const baseProgram: PersonalProgramType = {
  id: 'pp1',
  name: 'Personal Program',
  description: null,
  startDate: '2026-05-01T00:00:00.000Z',
  endDate: null,
  coverColor: null,
  visibility: 'PRIVATE',
  ownerUserId: 'u1',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
  _count: { workouts: 0 },
}

vi.mock('../lib/api', () => ({
  api: {
    me: {
      personalProgram: {
        get: vi.fn(),
        workouts: {
          list: vi.fn(),
          create: vi.fn(),
        },
      },
    },
    namedWorkouts: { list: vi.fn() },
    movements: { detect: vi.fn() },
    workouts: { update: vi.fn(), delete: vi.fn() },
  },
  TYPE_ABBR: {
    AMRAP: 'A', FOR_TIME: 'F', METCON: 'M', WARMUP: 'W',
  },
}))

vi.mock('../context/MovementsContext.tsx', () => ({
  useMovements: () => [] as { id: string; name: string; parentId: string | null }[],
}))

import { api } from '../lib/api'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.me.personalProgram.get).mockResolvedValue(baseProgram)
  vi.mocked(api.me.personalProgram.workouts.list).mockResolvedValue([])
  vi.mocked(api.namedWorkouts.list).mockResolvedValue([])
  vi.mocked(api.movements.detect).mockResolvedValue([])
})

function renderPage() {
  return render(<MemoryRouter><PersonalProgram /></MemoryRouter>)
}

describe('PersonalProgram page', () => {
  it('renders the heading + helper copy after fetching the program', async () => {
    renderPage()
    expect(await screen.findByText(/Your private workouts/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Personal Program')
  })

  it('mounts the calendar board (renders day-of-week headers)', async () => {
    renderPage()
    await screen.findByText(/Your private workouts/)
    // Day headers come from WorkoutCalendarBoard — confirms the shared
    // component is being mounted with the personal-program data source.
    expect(screen.getByText('Sun')).toBeInTheDocument()
    expect(screen.getByText('Sat')).toBeInTheDocument()
  })

  it('queries workouts with a from/to range when the calendar mounts', async () => {
    renderPage()
    await screen.findByText(/Your private workouts/)
    // The board's initial month load fires personalProgram.workouts.list with
    // a {from, to} arg — confirms the loadWorkouts callback is wired through.
    await waitFor(() => expect(api.me.personalProgram.workouts.list).toHaveBeenCalled())
    const arg = vi.mocked(api.me.personalProgram.workouts.list).mock.calls[0][0]
    expect(arg).toEqual(expect.objectContaining({
      from: expect.any(String),
      to: expect.any(String),
    }))
  })

  it('surfaces a friendly error when the program upsert fails', async () => {
    vi.mocked(api.me.personalProgram.get).mockRejectedValue(new Error('boom'))
    renderPage()
    expect(await screen.findByText('boom')).toBeInTheDocument()
  })
})
