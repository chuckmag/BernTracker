import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi, describe, it, beforeEach, expect } from 'vitest'
import AdminProgramDetail from './AdminProgramDetail'
import type { Program, Workout } from '../lib/api'

vi.mock('../lib/api', () => ({
  api: {
    admin: {
      programs: {
        list: vi.fn(),
        get: vi.fn(),
        listWorkouts: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        createWorkout: vi.fn(),
      },
      workouts: { update: vi.fn(), delete: vi.fn() },
    },
    // Editors imported by AdminProgramDetail call these on open. Tests below
    // never open the drawers, so the mocks only need to exist (for module
    // resolution) — actual return values are irrelevant.
    namedWorkouts: { list: vi.fn() },
    movements: { list: vi.fn(), detect: vi.fn() },
  },
  TYPE_ABBR: {
    STRENGTH: 'S', FOR_TIME: 'F', EMOM: 'E', CARDIO: 'C',
    AMRAP: 'A', METCON: 'M', WARMUP: 'W',
  },
}))

vi.mock('../context/MovementsContext.tsx', () => ({
  useMovements: () => [],
}))

import { api } from '../lib/api'

function makeProgram(): Program {
  return {
    id: 'p-1',
    name: 'CrossFit Mainsite',
    description: 'Daily WOD from CrossFit.com',
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: null,
    coverColor: null,
    visibility: 'PUBLIC',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    _count: { members: 0, workouts: 1 },
  }
}

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: overrides.id ?? 'w-1',
    title: overrides.title ?? 'Fran',
    description: '21-15-9 thrusters / pull-ups',
    coachNotes: null,
    type: 'FOR_TIME',
    status: 'PUBLISHED',
    scheduledAt: '2026-04-15T10:00:00.000Z',
    dayOrder: 0,
    workoutMovements: [],
    programId: 'p-1',
    program: { id: 'p-1', name: 'CrossFit Mainsite' },
    namedWorkoutId: null,
    namedWorkout: null,
    timeCapSeconds: null,
    tracksRounds: false,
    _count: { results: 0 },
    createdAt: '2026-04-15T10:00:00.000Z',
    updatedAt: '2026-04-15T10:00:00.000Z',
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/programs/p-1']}>
      <Routes>
        <Route path="/admin/programs/:id" element={<AdminProgramDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AdminProgramDetail', () => {
  beforeEach(() => {
    vi.mocked(api.admin.programs.get).mockResolvedValue(makeProgram())
    vi.mocked(api.admin.programs.listWorkouts).mockResolvedValue([])
  })

  it('renders without crashing', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'CrossFit Mainsite' })).toBeInTheDocument()
  })

  it('renders the workouts section header', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Workouts' })).toBeInTheDocument()
  })

  it('lists workouts when present', async () => {
    vi.mocked(api.admin.programs.listWorkouts).mockResolvedValue([
      makeWorkout({ id: 'w-1', title: 'Fran' }),
      makeWorkout({ id: 'w-2', title: 'Helen' }),
    ])
    renderPage()
    expect(await screen.findByText('Fran')).toBeInTheDocument()
    expect(await screen.findByText('Helen')).toBeInTheDocument()
  })

  it('shows empty-state copy when no workouts', async () => {
    renderPage()
    expect(await screen.findByText('No workouts yet.')).toBeInTheDocument()
  })

  it('renders the New Workout + Edit + Delete affordances (slice 3)', async () => {
    renderPage()
    expect(await screen.findByRole('button', { name: '+ New Workout' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Delete program/ })).toBeInTheDocument()
  })
})
