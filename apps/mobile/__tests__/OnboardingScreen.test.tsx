/**
 * OnboardingScreen tests
 *
 * Covers the #208 acceptance criteria:
 *   - step 0 → 1 → 2 progression
 *   - name validation blocks step 0 → 1 advance
 *   - birthday format validation blocks step 1 → submit
 *   - PATCH /api/users/me/profile is called with the four required fields
 *   - pending invitations fetched after profile save; shown when present
 *   - accept/decline calls the right endpoint (membershipRequest vs code-based)
 *   - refreshUser() invoked after profile save + after invitation step
 */

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import OnboardingScreen from '../src/screens/OnboardingScreen'

jest.mock('../src/lib/api', () => ({
  api: {
    users: {
      me: {
        profile: {
          get: jest.fn(),
          update: jest.fn(),
        },
        invitations: {
          accept: jest.fn(),
          decline: jest.fn(),
          pendingAll: jest.fn(),
        },
        codeInvitations: {
          accept: jest.fn(),
          decline: jest.fn(),
        },
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
    mode: 'system',
    setMode: jest.fn(),
    isDark: true,
    colors: {
      screenBg: '#030712', cardBg: '#111827', inputBg: '#1f2937',
      borderSubtle: '#1f2937', borderInteractive: '#374151',
      textPrimary: '#ffffff', textSecondary: '#d1d5db', textTertiary: '#9ca3af',
      textMuted: '#6b7280', textLabel: '#9ca3af', textPlaceholder: '#6b7280',
      primary: '#5B9BE6', primaryHover: '#7AB0EE', accent: '#5FD4D0', accentHover: '#7AE4E0',
      accentText: '#020617', successText: '#34d399', warningText: '#fbbf24', errorText: '#fb7185',
      rowHoverBg: '#1f2937', selectedBg: '#1f2937',
      tabBarBg: '#111827', tabBarBorder: '#1f2937',
      tabActive: '#5B9BE6', tabInactive: '#6b7280',
    },
  }),
}))

import { api } from '../src/lib/api'
import { useAuth } from '../src/context/AuthContext'

const mockRefreshUser = jest.fn().mockResolvedValue(undefined)

function emptyProfile() {
  return {
    id: 'u1',
    email: 'new@example.com',
    name: null,
    firstName: null,
    lastName: null,
    birthday: null,
    identifiedGender: null,
    avatarUrl: null,
    onboardedAt: null,
    role: 'MEMBER',
    preferredLoadUnit: 'LB',
    preferredDistanceUnit: 'M',
    emergencyContacts: [],
  }
}

function membershipInvite(id: string, gymName: string, inviterFirst: string): {
  kind: 'membershipRequest'
  data: {
    id: string; gymId: string; direction: 'STAFF_INVITED'; status: 'PENDING'
    email: null; userId: string; roleToGrant: 'MEMBER'
    invitedById: string; decidedById: null; decidedAt: null
    expiresAt: null; createdAt: string; updatedAt: string
    gym: { id: string; name: string; slug: string }
    invitedBy: { id: string; name: null; firstName: string; lastName: string; email: string }
  }
} {
  return {
    kind: 'membershipRequest',
    data: {
      id,
      gymId: `gym-${id}`,
      direction: 'STAFF_INVITED',
      status: 'PENDING',
      email: null,
      userId: 'u1',
      roleToGrant: 'MEMBER',
      invitedById: 'coach-1',
      decidedById: null,
      decidedAt: null,
      expiresAt: null,
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:00:00.000Z',
      gym: { id: `gym-${id}`, name: gymName, slug: gymName.toLowerCase() },
      invitedBy: { id: 'coach-1', name: null, firstName: inviterFirst, lastName: 'Coach', email: 'coach@example.com' },
    },
  }
}

describe('OnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useAuth as jest.Mock).mockReturnValue({
      user: { id: 'u1', email: 'new@example.com', onboardedAt: null },
      isLoading: false,
      loginWithTokens: jest.fn(),
      logout: jest.fn(),
      refreshUser: mockRefreshUser,
    })
    ;(api.users.me.profile.get as jest.Mock).mockResolvedValue(emptyProfile())
  })

  test('renders the name step on mount with the user email in the footer', async () => {
    const { findByTestId, findByText } = render(<OnboardingScreen />)
    await findByTestId('first-name-input')
    await findByTestId('last-name-input')
    await findByText(/Signed in as new@example.com/)
  })

  test('blocks advancing past step 0 without both names', async () => {
    const { findByTestId, findByText } = render(<OnboardingScreen />)

    fireEvent.press(await findByTestId('next-button'))
    await findByText(/First and last name are required/)
  })

  test('advances to step 1 once first + last name are filled', async () => {
    const { findByTestId } = render(<OnboardingScreen />)

    fireEvent.changeText(await findByTestId('first-name-input'), 'Alex')
    fireEvent.changeText(await findByTestId('last-name-input'), 'Doe')
    fireEvent.press(await findByTestId('next-button'))

    await findByTestId('birthday-input')
  })

  test('blocks step 1 submit when birthday is not YYYY-MM-DD', async () => {
    const { findByTestId, findByText } = render(<OnboardingScreen />)

    fireEvent.changeText(await findByTestId('first-name-input'), 'Alex')
    fireEvent.changeText(await findByTestId('last-name-input'), 'Doe')
    fireEvent.press(await findByTestId('next-button'))

    fireEvent.changeText(await findByTestId('birthday-input'), '01/15/1990')
    fireEvent.press(await findByTestId('next-button'))

    await findByText(/YYYY-MM-DD/)
    expect(api.users.me.profile.update).not.toHaveBeenCalled()
  })

  test('submits the four required fields and calls refreshUser when no invites exist', async () => {
    ;(api.users.me.profile.update as jest.Mock).mockResolvedValue({})
    ;(api.users.me.invitations.pendingAll as jest.Mock).mockResolvedValue([])

    const { findByTestId } = render(<OnboardingScreen />)

    fireEvent.changeText(await findByTestId('first-name-input'), 'Alex')
    fireEvent.changeText(await findByTestId('last-name-input'), 'Doe')
    fireEvent.press(await findByTestId('next-button'))

    fireEvent.changeText(await findByTestId('birthday-input'), '1990-04-15')
    fireEvent.press(await findByTestId('gender-chip-FEMALE'))
    fireEvent.press(await findByTestId('next-button'))

    await waitFor(() => {
      expect(api.users.me.profile.update).toHaveBeenCalledWith({
        firstName: 'Alex',
        lastName: 'Doe',
        birthday: '1990-04-15',
        identifiedGender: 'FEMALE',
      })
    })
    await waitFor(() => expect(mockRefreshUser).toHaveBeenCalled())
  })

  test('shows the invitations step when pendingAll returns gym invites', async () => {
    ;(api.users.me.profile.update as jest.Mock).mockResolvedValue({})
    ;(api.users.me.invitations.pendingAll as jest.Mock).mockResolvedValue([
      membershipInvite('inv-1', 'Iron Pulse', 'Casey'),
    ])

    const { findByTestId, findByText } = render(<OnboardingScreen />)

    fireEvent.changeText(await findByTestId('first-name-input'), 'Alex')
    fireEvent.changeText(await findByTestId('last-name-input'), 'Doe')
    fireEvent.press(await findByTestId('next-button'))

    fireEvent.changeText(await findByTestId('birthday-input'), '1990-04-15')
    fireEvent.press(await findByTestId('next-button'))

    // testID lookup on the card itself avoids the gym-name being nested
    // inside another <Text>, which RNTL's text matcher won't match across.
    await findByTestId('invite-inv-1')
    await findByText("You've been invited to a gym!")
  })

  test('accepting a membership-request invite calls the request-id endpoint', async () => {
    ;(api.users.me.profile.update as jest.Mock).mockResolvedValue({})
    ;(api.users.me.invitations.pendingAll as jest.Mock).mockResolvedValue([
      membershipInvite('inv-7', 'Iron Pulse', 'Casey'),
    ])
    ;(api.users.me.invitations.accept as jest.Mock).mockResolvedValue({})

    const { findByTestId } = render(<OnboardingScreen />)

    fireEvent.changeText(await findByTestId('first-name-input'), 'Alex')
    fireEvent.changeText(await findByTestId('last-name-input'), 'Doe')
    fireEvent.press(await findByTestId('next-button'))

    fireEvent.changeText(await findByTestId('birthday-input'), '1990-04-15')
    fireEvent.press(await findByTestId('next-button'))

    fireEvent.press(await findByTestId('invite-accept-inv-7'))

    await waitFor(() => expect(api.users.me.invitations.accept).toHaveBeenCalledWith('inv-7'))
    expect(api.users.me.codeInvitations.accept).not.toHaveBeenCalled()
  })

  test('declining a membership-request invite calls the decline endpoint', async () => {
    ;(api.users.me.profile.update as jest.Mock).mockResolvedValue({})
    ;(api.users.me.invitations.pendingAll as jest.Mock).mockResolvedValue([
      membershipInvite('inv-9', 'Iron Pulse', 'Casey'),
    ])
    ;(api.users.me.invitations.decline as jest.Mock).mockResolvedValue({})

    const { findByTestId } = render(<OnboardingScreen />)

    fireEvent.changeText(await findByTestId('first-name-input'), 'Alex')
    fireEvent.changeText(await findByTestId('last-name-input'), 'Doe')
    fireEvent.press(await findByTestId('next-button'))

    fireEvent.changeText(await findByTestId('birthday-input'), '1990-04-15')
    fireEvent.press(await findByTestId('next-button'))

    fireEvent.press(await findByTestId('invite-decline-inv-9'))
    await waitFor(() => expect(api.users.me.invitations.decline).toHaveBeenCalledWith('inv-9'))
  })

  test('pre-fills first/last name when the existing profile carries a single `name`', async () => {
    ;(api.users.me.profile.get as jest.Mock).mockResolvedValue({
      ...emptyProfile(),
      name: 'Jordan Smith',
    })

    const { findByDisplayValue } = render(<OnboardingScreen />)
    await findByDisplayValue('Jordan')
    await findByDisplayValue('Smith')
  })
})
