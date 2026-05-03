import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import PersonalProgram from './PersonalProgram'
import type { PersonalProgram as PersonalProgramType, Workout } from '../lib/api'

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

const seededWorkout: Workout = {
  id: 'w1',
  title: 'Easy Z2 row',
  description: '20 minutes at conversational pace',
  type: 'ROWING',
  status: 'DRAFT',
  scheduledAt: '2026-05-02T00:00:00.000Z',
  dayOrder: 0,
  workoutMovements: [],
  programId: 'pp1',
  program: { id: 'pp1', name: 'Personal Program' },
  namedWorkoutId: null,
  namedWorkout: null,
  timeCapSeconds: null,
  tracksRounds: false,
  _count: { results: 0 },
  createdAt: '2026-05-02T00:00:00.000Z',
  updatedAt: '2026-05-02T00:00:00.000Z',
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
  },
}))

import { api } from '../lib/api'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.me.personalProgram.get).mockResolvedValue(baseProgram)
  vi.mocked(api.me.personalProgram.workouts.list).mockResolvedValue([])
})

function renderPage() {
  return render(<MemoryRouter><PersonalProgram /></MemoryRouter>)
}

describe('PersonalProgram page', () => {
  it('renders the heading and empty state when no workouts exist', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Personal Program' })).toBeInTheDocument()
    expect(await screen.findByText(/No personal workouts yet/)).toBeInTheDocument()
  })

  it('lists existing personal workouts with title and date', async () => {
    vi.mocked(api.me.personalProgram.workouts.list).mockResolvedValue([seededWorkout])
    vi.mocked(api.me.personalProgram.get).mockResolvedValue({ ...baseProgram, _count: { workouts: 1 } })
    renderPage()
    expect(await screen.findByText('Easy Z2 row')).toBeInTheDocument()
    expect(screen.getByText('1 workout')).toBeInTheDocument()
  })

  it('opens the create form when "New workout" is clicked and submits valid input', async () => {
    vi.mocked(api.me.personalProgram.workouts.create).mockResolvedValue({
      ...seededWorkout,
      id: 'w2',
      title: 'Murph (light)',
    })
    renderPage()
    await screen.findByRole('heading', { name: 'Personal Program' })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /New workout/ }))

    await user.type(screen.getByLabelText('Title'), 'Murph (light)')
    await user.type(screen.getByLabelText('Description'), '1 mile run, 50 pull-ups, 100 push-ups, 150 squats, 1 mile run')
    await user.click(screen.getByRole('button', { name: /Create workout/ }))

    await waitFor(() => expect(api.me.personalProgram.workouts.create).toHaveBeenCalled())
    const payload = vi.mocked(api.me.personalProgram.workouts.create).mock.calls[0][0]
    expect(payload.title).toBe('Murph (light)')
    expect(payload.description).toContain('mile run')
    // After successful create, the new workout appears in the list.
    expect(await screen.findByText('Murph (light)')).toBeInTheDocument()
  })

  it('blocks create when title or description is empty', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Personal Program' })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /New workout/ }))
    // Leave fields blank — HTML5 `required` prevents submit, so api isn't called.
    await user.click(screen.getByRole('button', { name: /Create workout/ }))
    expect(api.me.personalProgram.workouts.create).not.toHaveBeenCalled()
  })
})
