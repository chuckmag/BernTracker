import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import GymPicker from './GymPicker'
import type { MyGym } from '../lib/api'

const mockGymCtx = {
  gyms: [] as MyGym[],
  gymId: null as string | null,
  gymRole: null,
  setGymId: vi.fn(),
  loading: false,
}

vi.mock('../context/GymContext.tsx', () => ({
  useGym: () => mockGymCtx,
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderPicker() {
  return render(<MemoryRouter><GymPicker /></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGymCtx.gyms = []
  mockGymCtx.gymId = null
})

describe('GymPicker', () => {
  it('renders the trigger with "No gym yet" when the user has no memberships', () => {
    renderPicker()
    expect(screen.getByRole('button', { expanded: false })).toHaveTextContent('No gym yet')
  })

  it('shows the active gym name on the trigger', () => {
    mockGymCtx.gyms = [{ id: 'g1', name: 'Crossfit Bern', slug: 'bern', role: 'OWNER' }]
    mockGymCtx.gymId = 'g1'
    renderPicker()
    expect(screen.getByRole('button')).toHaveTextContent('Crossfit Bern')
  })

  it('opens the menu on click and closes on Escape', async () => {
    renderPicker()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('lists each gym as a radio menuitem and marks the active one checked', async () => {
    mockGymCtx.gyms = [
      { id: 'g1', name: 'Gym One', slug: 'one', role: 'OWNER' },
      { id: 'g2', name: 'Gym Two', slug: 'two', role: 'MEMBER' },
    ]
    mockGymCtx.gymId = 'g2'
    renderPicker()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button'))

    const items = screen.getAllByRole('menuitemradio')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveAttribute('aria-checked', 'false')
    expect(items[1]).toHaveAttribute('aria-checked', 'true')
  })

  it('clicking a gym row calls setGymId and closes the menu', async () => {
    mockGymCtx.gyms = [
      { id: 'g1', name: 'Gym One', slug: 'one', role: 'OWNER' },
      { id: 'g2', name: 'Gym Two', slug: 'two', role: 'MEMBER' },
    ]
    mockGymCtx.gymId = 'g1'
    renderPicker()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button'))
    await user.click(screen.getByRole('menuitemradio', { name: /Gym Two/ }))

    expect(mockGymCtx.setGymId).toHaveBeenCalledWith('g2')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('shows "Browse gyms to join" copy when the user has no gyms', async () => {
    renderPicker()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button'))
    expect(screen.getByRole('menuitem', { name: /Browse gyms to join/ })).toBeInTheDocument()
  })

  it('shows "Find another gym to join" copy when the user already has gyms', async () => {
    mockGymCtx.gyms = [{ id: 'g1', name: 'Gym One', slug: 'one', role: 'OWNER' }]
    mockGymCtx.gymId = 'g1'
    renderPicker()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button'))
    expect(screen.getByRole('menuitem', { name: /Find another gym to join/ })).toBeInTheDocument()
  })

  it('"Set up a new gym" navigates to /gyms/new regardless of gym count', async () => {
    mockGymCtx.gyms = [{ id: 'g1', name: 'Gym One', slug: 'one', role: 'OWNER' }]
    mockGymCtx.gymId = 'g1'
    renderPicker()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button'))
    await user.click(screen.getByRole('menuitem', { name: /Set up a new gym/ }))
    expect(mockNavigate).toHaveBeenCalledWith('/gyms/new')
  })

  it('"Browse gyms to join" navigates to /gyms/browse', async () => {
    renderPicker()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button'))
    await user.click(screen.getByRole('menuitem', { name: /Browse gyms to join/ }))
    expect(mockNavigate).toHaveBeenCalledWith('/gyms/browse')
  })
})
