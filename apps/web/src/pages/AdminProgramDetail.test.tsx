import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
      workouts: { update: vi.fn(), delete: vi.fn(), publish: vi.fn() },
    },
    programs: {
      members: { list: vi.fn(), remove: vi.fn() },
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
    externalSourceId: null,
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
    vi.mocked(api.programs.members.list).mockResolvedValue([])
  })

  it('renders without crashing', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'CrossFit Mainsite' })).toBeInTheDocument()
  })

  it('renders the three tab buttons', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'CrossFit Mainsite' })
    expect(screen.getByRole('button', { name: /overview/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /members/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /workouts/i })).toBeInTheDocument()
  })

  it('renders Edit + Delete affordances on the overview tab', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'CrossFit Mainsite' })
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Delete program/ })).toBeInTheDocument()
  })

  it('shows member list empty state on Members tab', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'CrossFit Mainsite' })
    await userEvent.click(screen.getByRole('button', { name: /members/i }))
    // ProgramMembersTab renders an empty state when list returns []
    expect(await screen.findByText('No members yet')).toBeInTheDocument()
  })

  it('shows the workouts section header on Workouts tab', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'CrossFit Mainsite' })
    await userEvent.click(screen.getByRole('button', { name: /workouts/i }))
    expect(await screen.findByRole('heading', { name: 'Workouts' })).toBeInTheDocument()
  })

  it('shows empty-state copy when no workouts', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'CrossFit Mainsite' })
    await userEvent.click(screen.getByRole('button', { name: /workouts/i }))
    expect(await screen.findByText('No workouts yet.')).toBeInTheDocument()
  })

  it('lists workouts on the Workouts tab when present', async () => {
    vi.mocked(api.admin.programs.listWorkouts).mockResolvedValue([
      makeWorkout({ id: 'w-1', title: 'Fran' }),
      makeWorkout({ id: 'w-2', title: 'Helen' }),
    ])
    renderPage()
    await screen.findByRole('heading', { name: 'CrossFit Mainsite' })
    await userEvent.click(screen.getByRole('button', { name: /workouts/i }))
    expect(await screen.findByText('Fran')).toBeInTheDocument()
    expect(await screen.findByText('Helen')).toBeInTheDocument()
  })

  it('renders the New Workout button on the Workouts tab', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'CrossFit Mainsite' })
    await userEvent.click(screen.getByRole('button', { name: /workouts/i }))
    expect(await screen.findByRole('button', { name: '+ New Workout' })).toBeInTheDocument()
  })
})
