import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect } from 'vitest'
import ProgramList from './ProgramList'
import type { ProgramListItem } from './ProgramList'
import type { ProgramScope } from '../lib/programScope'
import type { Program } from '../lib/api'

vi.mock('./ProgramFormDrawer', () => ({ default: () => null }))

function makeProgram(overrides: Partial<Program> = {}): Program {
  return {
    id: overrides.id ?? 'p-1',
    name: overrides.name ?? 'Test Program',
    description: null,
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: null,
    coverColor: null,
    visibility: 'PUBLIC',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    _count: { members: 0, workouts: 0 },
    ...overrides,
  }
}

function makeScope(canWrite: boolean): ProgramScope {
  return {
    kind: 'admin',
    capabilities: { canWrite, canDelete: canWrite, canSeeMembers: false, canSetDefault: false },
    list: vi.fn(),
    get: vi.fn(),
    listWorkouts: vi.fn(),
    createProgram: vi.fn(),
    updateProgram: vi.fn(),
    deleteProgram: vi.fn(),
    createWorkout: vi.fn(),
    updateWorkout: vi.fn(),
    publishWorkout: vi.fn(),
    deleteWorkout: vi.fn(),
  }
}

function render_(items: ProgramListItem[], scope = makeScope(true), extra?: Partial<Parameters<typeof ProgramList>[0]>) {
  return render(
    <MemoryRouter>
      <ProgramList
        scope={scope}
        items={items}
        loading={false}
        error={null}
        detailBasePath="/programs"
        onCreated={vi.fn()}
        {...extra}
      />
    </MemoryRouter>,
  )
}

describe('ProgramList', () => {
  it('renders the Programs heading and count', () => {
    render_([{ program: makeProgram({ name: 'Block 1' }) }])
    expect(screen.getByRole('heading', { name: 'Programs' })).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('shows program cards with links to the detail path', () => {
    render_([
      { program: makeProgram({ id: 'p-1', name: 'Block 1' }) },
      { program: makeProgram({ id: 'p-2', name: 'Block 2' }) },
    ])
    expect(screen.getByText('Block 1')).toBeInTheDocument()
    expect(screen.getByText('Block 2')).toBeInTheDocument()
  })

  it('shows empty state when there are no programs', () => {
    render_([])
    expect(screen.getByText('No programs yet')).toBeInTheDocument()
  })

  it('renders custom emptyTitle and emptyBody', () => {
    render_([], makeScope(true), { emptyTitle: 'No items', emptyBody: 'Add one first.' })
    expect(screen.getByText('No items')).toBeInTheDocument()
    expect(screen.getByText('Add one first.')).toBeInTheDocument()
  })

  it('shows "+ New Program" button when canWrite', () => {
    render_([])
    // Header button + empty-state CTA both render when canWrite and list is empty.
    expect(screen.getAllByRole('button', { name: '+ New Program' }).length).toBeGreaterThan(0)
  })

  it('hides "+ New Program" button when !canWrite', () => {
    render_([], makeScope(false))
    expect(screen.queryByRole('button', { name: '+ New Program' })).not.toBeInTheDocument()
  })

  it('renders a description when provided', () => {
    render_([], makeScope(true), { description: 'Some subtitle text.' })
    expect(screen.getByText('Some subtitle text.')).toBeInTheDocument()
  })

  it('shows loading skeleton instead of content', () => {
    const { container } = render_([], makeScope(true), { loading: true })
    expect(container.querySelector('[aria-busy]') ?? container.querySelector('.animate-pulse')).toBeTruthy()
    expect(screen.queryByText('No programs yet')).not.toBeInTheDocument()
  })

  it('shows error message when error is set', () => {
    render_([], makeScope(true), { error: 'Something went wrong' })
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('uses h1 when heading="h1"', () => {
    render_([], makeScope(true), { heading: 'h1' })
    expect(screen.getByRole('heading', { name: 'Programs', level: 1 })).toBeInTheDocument()
  })

  it('defaults to h2 heading', () => {
    render_([])
    expect(screen.getByRole('heading', { name: 'Programs', level: 2 })).toBeInTheDocument()
  })
})
