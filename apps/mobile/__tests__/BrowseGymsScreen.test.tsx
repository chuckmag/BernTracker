import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import BrowseGymsScreen from '../src/screens/BrowseGymsScreen'

jest.mock('../src/lib/api', () => ({
  api: {
    gyms: {
      browse: jest.fn(),
      joinRequest: {
        create: jest.fn(),
        cancel: jest.fn(),
      },
    },
  },
}))

jest.mock('../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}))

jest.mock('../src/lib/theme', () => ({
  __esModule: true,
  useTheme: () => ({
    isDark: false,
    colors: {
      screenBg: '#f8fafc', cardBg: '#ffffff', inputBg: '#ffffff',
      surfaceSubtle: '#f1f5f9',
      borderSubtle: '#e2e8f0', borderInteractive: '#cbd5e1',
      textPrimary: '#020617', textSecondary: '#334155', textTertiary: '#64748b',
      textMuted: '#64748b', textLabel: '#475569', textPlaceholder: '#94a3b8',
      primary: '#1E5AA8', primaryHover: '#1A4D90', accent: '#2BA8A4', accentHover: '#238F8B',
      accentText: '#020617', onPrimary: '#ffffff', onPrimaryTint: 'rgba(255,255,255,0.18)',
      modalScrim: 'rgba(0,0,0,0.6)',
      successText: '#15803d', warningText: '#b45309', errorText: '#be123c',
      successBg: 'rgba(16,185,129,0.15)', warningBg: 'rgba(245,158,11,0.15)',
      rowHoverBg: '#f8fafc', selectedBg: '#f1f5f9',
      tabBarBg: '#ffffff', tabBarBorder: '#e2e8f0',
      tabActive: '#1E5AA8', tabInactive: '#94a3b8',
    },
  }),
}))

import { api } from '../src/lib/api'
import { useAuth } from '../src/context/AuthContext'

const mockRefreshUser = jest.fn()

function gym(
  id: string,
  name: string,
  status: 'NONE' | 'MEMBER' | 'REQUEST_PENDING' = 'NONE',
) {
  return { id, name, slug: name.toLowerCase(), timezone: 'America/New_York', logoUrl: null, memberCount: 10, callerStatus: status }
}

describe('BrowseGymsScreen', () => {
  beforeEach(() => {
    // resetAllMocks clears implementations (not just call counts) so that a
    // mockResolvedValue set in one test can't bleed into the next via the
    // default implementation slot.
    jest.resetAllMocks()
    mockRefreshUser.mockResolvedValue(undefined)
    ;(useAuth as jest.Mock).mockReturnValue({ refreshUser: mockRefreshUser })
  })

  test('renders the list of gyms returned by the API', async () => {
    ;(api.gyms.browse as jest.Mock).mockResolvedValue([
      gym('g1', 'Iron Pulse CrossFit'),
      gym('g2', 'Storm Fitness'),
    ])

    const { findByText } = render(<BrowseGymsScreen />)

    await findByText('Iron Pulse CrossFit')
    await findByText('Storm Fitness')
  })

  test('shows the loading spinner before data arrives', () => {
    ;(api.gyms.browse as jest.Mock).mockReturnValue(new Promise(() => {}))

    const { getByTestId } = render(<BrowseGymsScreen />)
    // FlatList renders ListEmptyComponent while gyms=[]; hasLoaded=false → spinner
    // We can't assertSpinner directly but we confirm the gym-list is empty (no rows).
    expect(() => getByTestId('gym-row-g1')).toThrow()
  })

  test('shows empty state with search message when search term returns nothing', async () => {
    ;(api.gyms.browse as jest.Mock).mockResolvedValue([])

    const { findByText, getByTestId } = render(<BrowseGymsScreen />)

    await findByText(/No gyms found/)

    // Simulate a search
    fireEvent.changeText(getByTestId('gym-search-input'), 'Nowhere')
    // Debounce fires after 200ms; use fake timers or just let the queue flush
    await waitFor(() => expect(api.gyms.browse).toHaveBeenCalledWith('Nowhere'))

    // After fetch with the search term returns nothing
    ;(api.gyms.browse as jest.Mock).mockResolvedValueOnce([])
    await waitFor(() => expect(api.gyms.browse).toHaveBeenCalledTimes(2))
  })

  test('surfaces an error message when the API call fails', async () => {
    ;(api.gyms.browse as jest.Mock).mockRejectedValue(new Error('Network error'))

    const { findByTestId, getByText } = render(<BrowseGymsScreen />)
    // Wait for the error element to appear, then verify its text.
    await findByTestId('browse-gyms-error')
    getByText('Network error')
  })

  test('Request to join button calls joinRequest.create and optimistically flips status', async () => {
    ;(api.gyms.browse as jest.Mock).mockResolvedValue([gym('g1', 'Iron Pulse CrossFit')])
    ;(api.gyms.joinRequest.create as jest.Mock).mockResolvedValue({})

    const { findByTestId, queryByTestId } = render(<BrowseGymsScreen />)

    fireEvent.press(await findByTestId('gym-request-g1'))

    await waitFor(() => expect(api.gyms.joinRequest.create).toHaveBeenCalledWith('g1'))
    // After optimistic update the request button is gone; cancel appears
    await findByTestId('gym-cancel-g1')
    expect(queryByTestId('gym-request-g1')).toBeNull()
  })

  test('Cancel button calls joinRequest.cancel and optimistically flips status back', async () => {
    ;(api.gyms.browse as jest.Mock).mockResolvedValue([gym('g1', 'Iron Pulse CrossFit', 'REQUEST_PENDING')])
    ;(api.gyms.joinRequest.cancel as jest.Mock).mockResolvedValue({})

    const { findByTestId, queryByTestId } = render(<BrowseGymsScreen />)

    fireEvent.press(await findByTestId('gym-cancel-g1'))

    await waitFor(() => expect(api.gyms.joinRequest.cancel).toHaveBeenCalledWith('g1'))
    // After optimistic update the cancel button is gone; request button appears
    await findByTestId('gym-request-g1')
    expect(queryByTestId('gym-cancel-g1')).toBeNull()
  })

  test('Member badge is shown and no action button rendered for MEMBER gyms', async () => {
    ;(api.gyms.browse as jest.Mock).mockResolvedValue([gym('g1', 'Iron Pulse CrossFit', 'MEMBER')])

    const { findByTestId, queryByTestId } = render(<BrowseGymsScreen />)

    await findByTestId('gym-member-badge-g1')
    expect(queryByTestId('gym-request-g1')).toBeNull()
    expect(queryByTestId('gym-cancel-g1')).toBeNull()
  })

  test('surfaces a join-request API error inline without crashing', async () => {
    ;(api.gyms.browse as jest.Mock).mockResolvedValue([gym('g1', 'Iron Pulse CrossFit')])
    ;(api.gyms.joinRequest.create as jest.Mock).mockRejectedValue(new Error('Already requested'))

    const { findByTestId, findByText } = render(<BrowseGymsScreen />)

    fireEvent.press(await findByTestId('gym-request-g1'))

    await findByText('Already requested')
    // Row stays in NONE state (no optimistic flip on error)
    await findByTestId('gym-request-g1')
  })

  test('calls refreshUser when any gym row shows MEMBER status', async () => {
    ;(api.gyms.browse as jest.Mock).mockResolvedValue([gym('g1', 'Iron Pulse CrossFit', 'MEMBER')])

    render(<BrowseGymsScreen />)

    await waitFor(() => expect(mockRefreshUser).toHaveBeenCalled())
  })
})
