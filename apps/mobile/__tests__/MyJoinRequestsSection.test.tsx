import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import MyJoinRequestsSection from '../src/components/MyJoinRequestsSection'

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}))

jest.mock('../src/lib/api', () => ({
  api: {
    users: {
      me: {
        joinRequests: {
          list: jest.fn(),
        },
      },
    },
    gyms: {
      joinRequest: {
        cancel: jest.fn(),
      },
    },
  },
}))

jest.mock('../src/lib/theme', () => ({
  __esModule: true,
  useTheme: () => ({
    isDark: true,
    colors: {
      screenBg: '#030712', cardBg: '#111827', inputBg: '#1f2937', surfaceSubtle: '#1f2937',
      borderSubtle: '#1f2937', borderInteractive: '#374151',
      textPrimary: '#ffffff', textSecondary: '#d1d5db', textTertiary: '#9ca3af',
      textMuted: '#6b7280', textLabel: '#9ca3af', textPlaceholder: '#6b7280',
      primary: '#5B9BE6', onPrimary: '#ffffff',
      successText: '#34d399', errorText: '#fb7185',
    },
  }),
}))

import { api } from '../src/lib/api'

const joinReq = (overrides: Record<string, unknown> = {}) => ({
  id: 'jr1',
  gymId: 'g1',
  direction: 'USER_REQUESTED' as const,
  status: 'PENDING' as const,
  email: null,
  userId: 'u1',
  roleToGrant: 'MEMBER' as const,
  invitedById: null,
  decidedById: null,
  decidedAt: null,
  expiresAt: null,
  createdAt: '2026-05-30T10:00:00.000Z',
  updatedAt: '2026-05-30T10:00:00.000Z',
  gym: { id: 'g1', name: 'CrossFit Test', slug: 'cf-test' },
  user: { id: 'u1', name: null, firstName: 'Alex', lastName: 'Doe', email: 'alex@a.com' },
  ...overrides,
})

describe('MyJoinRequestsSection', () => {
  beforeEach(() => { jest.clearAllMocks() })

  test('renders nothing once loaded with no outgoing requests', async () => {
    ;(api.users.me.joinRequests.list as jest.Mock).mockResolvedValue([])
    const { queryByTestId } = render(<MyJoinRequestsSection />)
    await waitFor(() => expect(queryByTestId('my-join-requests-loading')).toBeNull())
    expect(queryByTestId('my-join-requests-section')).toBeNull()
  })

  test('renders one card per outgoing request', async () => {
    ;(api.users.me.joinRequests.list as jest.Mock).mockResolvedValue([
      joinReq(),
      joinReq({ id: 'jr2', gym: { id: 'g2', name: 'Garage Gym', slug: 'garage' } }),
    ])
    const { findByTestId, findByText } = render(<MyJoinRequestsSection />)
    await findByTestId('my-join-request-jr1')
    await findByTestId('my-join-request-jr2')
    await findByText('CrossFit Test')
    await findByText('Garage Gym')
  })

  test('Cancel calls api.gyms.joinRequest.cancel(gymId) and drops the row', async () => {
    ;(api.users.me.joinRequests.list as jest.Mock).mockResolvedValue([joinReq()])
    ;(api.gyms.joinRequest.cancel as jest.Mock).mockResolvedValue(undefined)
    const { findByTestId, queryByTestId } = render(<MyJoinRequestsSection />)
    fireEvent.press(await findByTestId('cancel-join-request-jr1'))
    await waitFor(() => expect(api.gyms.joinRequest.cancel).toHaveBeenCalledWith('g1'))
    await waitFor(() => expect(queryByTestId('my-join-request-jr1')).toBeNull())
  })

  test('failed cancel surfaces the error and leaves the row in place', async () => {
    ;(api.users.me.joinRequests.list as jest.Mock).mockResolvedValue([joinReq()])
    ;(api.gyms.joinRequest.cancel as jest.Mock).mockRejectedValue(new Error('nope'))
    const { findByTestId, findByText } = render(<MyJoinRequestsSection />)
    fireEvent.press(await findByTestId('cancel-join-request-jr1'))
    await findByText('nope')
    await findByTestId('my-join-request-jr1')
  })
})
