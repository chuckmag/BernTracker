import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, beforeEach, expect } from 'vitest'
import AdminSettings from './AdminSettings'
import type { Program } from '../lib/api'

vi.mock('../lib/api', () => ({
  api: {
    admin: {
      programs: {
        list: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        get: vi.fn(),
        listWorkouts: vi.fn(),
        createWorkout: vi.fn(),
      },
      workouts: { update: vi.fn(), publish: vi.fn(), delete: vi.fn() },
    },
    movements: {
      library: vi.fn(),
      update: vi.fn(),
      review: vi.fn(),
    },
  },
}))

vi.mock('../context/MovementsContext.tsx', () => ({
  useMovements: () => [],
}))

import { api } from '../lib/api'
import type { LibraryMovement } from '../lib/api'

function makeLibraryMovement(overrides: Partial<LibraryMovement> = {}): LibraryMovement {
  return {
    id: overrides.id ?? 'm-1',
    name: overrides.name ?? 'Back Squat',
    status: overrides.status ?? 'ACTIVE',
    category: overrides.category ?? 'STRENGTH',
    prTypes: overrides.prTypes ?? ['LOAD'],
    aliases: overrides.aliases ?? [],
    sourceUrl: overrides.sourceUrl ?? null,
    parentId: overrides.parentId ?? null,
    parentName: overrides.parentName ?? null,
    variationCount: overrides.variationCount ?? 0,
    ...overrides,
  }
}

function makeProgram(overrides: Partial<Program> = {}): Program {
  return {
    id: overrides.id ?? 'p-1',
    name: overrides.name ?? 'CrossFit Mainsite',
    description: null,
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: null,
    coverColor: null,
    visibility: 'PUBLIC',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    _count: { members: 0, workouts: 1 },
    ...overrides,
  }
}

function renderPage(initialEntry = '/admin/settings') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AdminSettings />
    </MemoryRouter>,
  )
}

describe('AdminSettings', () => {
  beforeEach(() => {
    vi.mocked(api.admin.programs.list).mockResolvedValue([])
    vi.mocked(api.movements.library).mockResolvedValue([])
  })

  it('renders the WODalytics Settings heading and both tabs', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'WODalytics Settings', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Programs' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Movements' })).toBeInTheDocument()
  })

  it('defaults to the Programs tab and lists programs', async () => {
    vi.mocked(api.admin.programs.list).mockResolvedValue([
      makeProgram({ id: 'p-1', name: 'CrossFit Mainsite' }),
    ])
    renderPage()
    expect(await screen.findByText('CrossFit Mainsite')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ New Program' })).toBeInTheDocument()
    // library() is only called when the Movements tab activates — not on default Programs tab.
    expect(api.movements.library).not.toHaveBeenCalled()
  })

  it('switches to the Movements tab and loads pending movements', async () => {
    const user = userEvent.setup()
    vi.mocked(api.movements.library).mockResolvedValue([
      makeLibraryMovement({ id: 'm-1', name: 'Kipping HSPU', status: 'PENDING', category: 'GYMNASTICS' }),
    ])
    renderPage()
    await user.click(screen.getByRole('tab', { name: 'Movements' }))
    expect(await screen.findByRole('heading', { name: 'Pending Movements' })).toBeInTheDocument()
    // Movement appears in both the pending review list and the library table.
    expect(await screen.findAllByText('Kipping HSPU')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
  })
})
