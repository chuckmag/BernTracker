import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import MyInvitationsSection from '../src/components/MyInvitationsSection'

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
        invitations: {
          accept:     jest.fn(),
          decline:    jest.fn(),
          pendingAll: jest.fn(),
        },
        codeInvitations: {
          accept:  jest.fn(),
          decline: jest.fn(),
        },
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

const membershipReq = (overrides: Record<string, unknown> = {}) => ({
  kind: 'membershipRequest' as const,
  data: {
    id: 'mr1',
    gymId: 'g1',
    direction: 'STAFF_INVITED' as const,
    status: 'PENDING' as const,
    email: 'invitee@example.com',
    userId: 'u1',
    roleToGrant: 'MEMBER' as const,
    invitedById: 'staff1',
    decidedById: null,
    decidedAt: null,
    expiresAt: null,
    createdAt: '2026-05-30T10:00:00.000Z',
    updatedAt: '2026-05-30T10:00:00.000Z',
    gym: { id: 'g1', name: 'CrossFit Test', slug: 'cf-test' },
    invitedBy: { id: 'staff1', name: null, firstName: 'Sam', lastName: 'Coach', email: 'sam@cf.com' },
    ...overrides,
  },
})

const codeInvite = (overrides: Record<string, unknown> = {}) => ({
  kind: 'invitation' as const,
  data: {
    id: 'inv1',
    code: 'ABC123',
    gymId: 'g2',
    roleToGrant: 'COACH' as const,
    status: 'PENDING' as const,
    channel: 'EMAIL' as const,
    invitedById: 'staff1',
    createdAt: '2026-05-29T10:00:00.000Z',
    gym: { id: 'g2', name: 'Garage Gym', slug: 'garage' },
    invitedBy: { id: 'staff1', name: null, firstName: 'Sam', lastName: 'Coach', email: 'sam@cf.com' },
    ...overrides,
  },
})

describe('MyInvitationsSection', () => {
  beforeEach(() => { jest.clearAllMocks() })

  test('renders nothing once loaded with zero invitations', async () => {
    ;(api.users.me.invitations.pendingAll as jest.Mock).mockResolvedValue([])
    const { queryByTestId } = render(<MyInvitationsSection />)
    await waitFor(() => expect(queryByTestId('my-invitations-loading')).toBeNull())
    expect(queryByTestId('my-invitations-section')).toBeNull()
  })

  test('renders one card per pending invite with gym + role + inviter copy', async () => {
    ;(api.users.me.invitations.pendingAll as jest.Mock).mockResolvedValue([
      membershipReq(),
      codeInvite(),
    ])
    const { findByText, findAllByText } = render(<MyInvitationsSection />)
    await findByText('CrossFit Test')
    await findByText('Garage Gym')
    await findByText('Member')
    await findByText('Coach')
    // Inviter line is a single Text node carrying "From Sam Coach · M/D/YYYY"
    // for both invitation kinds. We assert both occurrences are present
    // without coupling to the locale-dependent date format.
    const matches = await findAllByText(/From Sam Coach/)
    expect(matches.length).toBe(2)
  })

  test('Accept on a membershipRequest invokes invitations.accept(id) and removes the row', async () => {
    ;(api.users.me.invitations.pendingAll as jest.Mock).mockResolvedValue([membershipReq()])
    ;(api.users.me.invitations.accept as jest.Mock).mockResolvedValue(undefined)
    const { findByTestId, queryByTestId } = render(<MyInvitationsSection />)
    fireEvent.press(await findByTestId('accept-invitation-mr1'))
    await waitFor(() => expect(api.users.me.invitations.accept).toHaveBeenCalledWith('mr1'))
    await waitFor(() => expect(queryByTestId('my-invitation-mr1')).toBeNull())
  })

  test('Decline on a code invite invokes codeInvitations.decline(code) and removes the row', async () => {
    ;(api.users.me.invitations.pendingAll as jest.Mock).mockResolvedValue([codeInvite()])
    ;(api.users.me.codeInvitations.decline as jest.Mock).mockResolvedValue(undefined)
    const { findByTestId, queryByTestId } = render(<MyInvitationsSection />)
    fireEvent.press(await findByTestId('decline-invitation-code-ABC123'))
    await waitFor(() => expect(api.users.me.codeInvitations.decline).toHaveBeenCalledWith('ABC123'))
    await waitFor(() => expect(queryByTestId('my-invitation-code-ABC123')).toBeNull())
  })

  test('onChange fires with the new length after a successful action', async () => {
    ;(api.users.me.invitations.pendingAll as jest.Mock).mockResolvedValue([membershipReq()])
    ;(api.users.me.invitations.accept as jest.Mock).mockResolvedValue(undefined)
    const onChange = jest.fn()
    const { findByTestId } = render(<MyInvitationsSection onChange={onChange} />)
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(1))
    fireEvent.press(await findByTestId('accept-invitation-mr1'))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(0))
  })
})
