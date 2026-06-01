/**
 * BrowseProgramsScreen tests (#507)
 *
 * Covers the two-section catalog (public + gym), loading + empty + error
 * states, and the Join flow: subscribe → drop from list → setProgramFilter
 * → navigate to Feed tab.
 */

import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import BrowseProgramsScreen from '../src/screens/BrowseProgramsScreen'

jest.mock('../src/context/GymContext', () => ({
  useGym: jest.fn(),
}))

jest.mock('../src/context/ProgramFilterContext', () => ({
  useProgramFilter: jest.fn(),
}))

jest.mock('../src/lib/api', () => ({
  api: {
    programs: {
      publicCatalog: jest.fn(),
      subscribe: jest.fn(),
    },
    gyms: {
      programs: {
        browse: jest.fn(),
      },
    },
  },
}))

import { useGym } from '../src/context/GymContext'
import { useProgramFilter } from '../src/context/ProgramFilterContext'
import { api } from '../src/lib/api'

const ACTIVE_GYM = { id: 'gym-1', name: 'Test Gym', slug: 'test-gym', timezone: 'UTC', role: 'MEMBER' as const }

function publicProgram(id: string, name: string, overrides: Partial<{ description: string; coverColor: string; _count: { members: number; workouts: number } }> = {}) {
  return {
    id,
    name,
    description: overrides.description ?? null,
    visibility: 'PUBLIC' as const,
    coverColor: overrides.coverColor ?? null,
    _count: overrides._count,
  }
}

function gymProgram(id: string, name: string, isDefault = false, overrides: Partial<{ memberCount: number }> = {}) {
  return {
    gymId: ACTIVE_GYM.id,
    programId: id,
    isDefault,
    program: {
      id,
      name,
      description: null,
      visibility: 'PUBLIC' as const,
      coverColor: null,
      _count: overrides.memberCount !== undefined ? { members: overrides.memberCount, workouts: 0 } : undefined,
    },
  }
}

function makeNavigation() {
  return { navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn() } as any
}

let setSelected: jest.Mock

describe('BrowseProgramsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setSelected = jest.fn()
    ;(useGym as jest.Mock).mockReturnValue({ activeGym: ACTIVE_GYM, isLoading: false, selectGym: jest.fn() })
    ;(useProgramFilter as jest.Mock).mockReturnValue({
      selected: [],
      available: [],
      defaultProgramId: null,
      loading: false,
      setSelected,
      toggle: jest.fn(),
      clear: jest.fn(),
    })
    ;(api.programs.publicCatalog as jest.Mock).mockResolvedValue([])
    ;(api.gyms.programs.browse as jest.Mock).mockResolvedValue([])
  })

  test('renders both section headings and the intro copy', async () => {
    const { findByText, getByText } = render(
      <BrowseProgramsScreen navigation={makeNavigation()} route={{} as any} />,
    )
    await findByText('Browse programs')
    expect(getByText('Public programs')).toBeTruthy()
    expect(getByText('From your gym')).toBeTruthy()
  })

  test('renders public programs returned by the API with member count', async () => {
    ;(api.programs.publicCatalog as jest.Mock).mockResolvedValue([
      publicProgram('p1', 'CrossFit Mainsite', { _count: { members: 42, workouts: 365 } }),
    ])
    const { findByText } = render(
      <BrowseProgramsScreen navigation={makeNavigation()} route={{} as any} />,
    )
    await findByText('CrossFit Mainsite')
    await findByText('42 members')
  })

  test('renders gym programs and surfaces the Default badge for the gym default', async () => {
    ;(api.gyms.programs.browse as jest.Mock).mockResolvedValue([
      gymProgram('p2', 'Strength Cycle', true, { memberCount: 1 }),
      gymProgram('p3', 'Endurance Cycle', false, { memberCount: 7 }),
    ])
    const { findByText, getAllByText } = render(
      <BrowseProgramsScreen navigation={makeNavigation()} route={{} as any} />,
    )
    await findByText('Strength Cycle')
    await findByText('Endurance Cycle')
    expect(getAllByText('Default')).toHaveLength(1)
    // Singular pluralization at 1 member.
    await findByText('1 member')
  })

  test('shows the gym-less subtitle and skips the gym fetch when no gym is active', async () => {
    ;(useGym as jest.Mock).mockReturnValue({ activeGym: null, isLoading: false, selectGym: jest.fn() })
    const { findByText, queryByTestId } = render(
      <BrowseProgramsScreen navigation={makeNavigation()} route={{} as any} />,
    )
    await findByText(/Set up your gym in Settings/)
    expect(api.gyms.programs.browse).not.toHaveBeenCalled()
    // Gym section has no loading indicator because the call was never started.
    expect(queryByTestId('section-loading')).toBeNull()
  })

  test('public-catalog empty state', async () => {
    ;(api.programs.publicCatalog as jest.Mock).mockResolvedValue([])
    const { findByText } = render(
      <BrowseProgramsScreen navigation={makeNavigation()} route={{} as any} />,
    )
    await findByText('No public programs available')
  })

  test('Join calls subscribe, removes the program from the list, sets the program filter, and navigates to Feed', async () => {
    ;(api.programs.publicCatalog as jest.Mock).mockResolvedValue([
      publicProgram('p1', 'CrossFit Mainsite', { _count: { members: 1, workouts: 1 } }),
    ])
    ;(api.programs.subscribe as jest.Mock).mockResolvedValue({
      programId: 'p1', userId: 'u1', role: 'MEMBER', joinedAt: '2026-05-31T00:00:00Z',
    })
    const nav = makeNavigation()

    const { findByTestId, queryByText } = render(
      <BrowseProgramsScreen navigation={nav} route={{} as any} />,
    )
    const joinBtn = await findByTestId('join-p1')
    await act(async () => { fireEvent.press(joinBtn) })

    await waitFor(() => {
      expect(api.programs.subscribe).toHaveBeenCalledWith('p1')
    })
    expect(setSelected).toHaveBeenCalledWith(['p1'])
    expect(nav.navigate).toHaveBeenCalledWith('Main', { screen: 'FeedTab' })
    // Card vanishes after a successful subscribe.
    expect(queryByText('CrossFit Mainsite')).toBeNull()
  })

  test('surfaces an inline error when the public catalog fetch fails', async () => {
    ;(api.programs.publicCatalog as jest.Mock).mockRejectedValue(new Error('Network down'))
    const { findByText } = render(
      <BrowseProgramsScreen navigation={makeNavigation()} route={{} as any} />,
    )
    await findByText('Network down')
  })
})
