import React from 'react'
import { Share } from 'react-native'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import InviteFriendScreen from '../src/screens/InviteFriendScreen'

const mockGoBack = jest.fn()
const mockNavigate = jest.fn()

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: mockNavigate }),
}))

jest.mock('../src/lib/api', () => ({
  api: {
    invitations: { create: jest.fn() },
  },
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
      accentText: '#020617', onPrimary: '#ffffff', onPrimaryTint: 'rgba(255,255,255,0.18)',
      modalScrim: 'rgba(0,0,0,0.6)', surfaceSubtle: '#1f2937',
      successText: '#34d399', warningText: '#fbbf24', errorText: '#fb7185',
      rowHoverBg: '#1f2937', selectedBg: '#1f2937',
      tabBarBg: '#111827', tabBarBorder: '#1f2937',
      tabActive: '#5B9BE6', tabInactive: '#6b7280',
    },
  }),
}))

import { api } from '../src/lib/api'

function makeInvitation(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'inv-1',
    code: 'A3X9KF',
    channel: 'EMAIL',
    email: 'friend@example.com',
    phone: null,
    gymId: null,
    roleToGrant: 'MEMBER',
    invitedById: 'u1',
    status: 'PENDING',
    expiresAt: '2026-06-30T00:00:00.000Z',
    acceptedById: null,
    createdAt: '2026-05-31T00:00:00.000Z',
    updatedAt: '2026-05-31T00:00:00.000Z',
    gym: null,
    invitedBy: { id: 'u1', firstName: 'Alex', lastName: 'Doe' },
    ...overrides,
  }
}

describe('InviteFriendScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('renders with EMAIL channel selected by default and shows the email input', () => {
    const { getByTestId, queryByTestId } = render(<InviteFriendScreen />)
    expect(getByTestId('invite-email-input')).toBeTruthy()
    expect(queryByTestId('invite-phone-input')).toBeNull()
  })

  test('switching to SMS swaps the input for a phone field', () => {
    const { getByTestId, queryByTestId } = render(<InviteFriendScreen />)
    fireEvent.press(getByTestId('channel-chip-SMS'))
    expect(getByTestId('invite-phone-input')).toBeTruthy()
    expect(queryByTestId('invite-email-input')).toBeNull()
  })

  test('empty email submission surfaces an inline error and does not call the API', () => {
    const { getByTestId } = render(<InviteFriendScreen />)
    fireEvent.press(getByTestId('send-invite-button'))
    expect(getByTestId('invite-error').props.children).toMatch(/Enter an email address/i)
    expect(api.invitations.create).not.toHaveBeenCalled()
  })

  test('invalid email format surfaces an inline error and does not call the API', () => {
    const { getByTestId } = render(<InviteFriendScreen />)
    fireEvent.changeText(getByTestId('invite-email-input'), 'not-an-email')
    fireEvent.press(getByTestId('send-invite-button'))
    expect(getByTestId('invite-error').props.children).toMatch(/valid email/i)
    expect(api.invitations.create).not.toHaveBeenCalled()
  })

  test('non-E.164 phone surfaces an inline error and does not call the API', () => {
    const { getByTestId } = render(<InviteFriendScreen />)
    fireEvent.press(getByTestId('channel-chip-SMS'))
    fireEvent.changeText(getByTestId('invite-phone-input'), '555-1234')
    fireEvent.press(getByTestId('send-invite-button'))
    expect(getByTestId('invite-error').props.children).toMatch(/international format/i)
    expect(api.invitations.create).not.toHaveBeenCalled()
  })

  test('valid email submit POSTs to the API, opens Share with the code, and renders the success card', async () => {
    ;(api.invitations.create as jest.Mock).mockResolvedValue(makeInvitation())
    const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any)

    const { getByTestId, findByTestId, getByText } = render(<InviteFriendScreen />)

    fireEvent.changeText(getByTestId('invite-email-input'), 'FRIEND@example.com')
    fireEvent.press(getByTestId('send-invite-button'))

    await waitFor(() => {
      expect(api.invitations.create).toHaveBeenCalledWith({
        channel: 'EMAIL',
        // Trimmed + lowercased before sending — server PhoneSchema/email lowercases too
        email: 'friend@example.com',
      })
    })

    expect(shareSpy).toHaveBeenCalledTimes(1)
    const shareCall = shareSpy.mock.calls[0][0] as { message: string; url: string }
    expect(shareCall.message).toContain('A3X9KF')
    expect(shareCall.url).toContain('/join/A3X9KF')

    await findByTestId('invite-success-card')
    expect(getByText('A3X9KF')).toBeTruthy()
    shareSpy.mockRestore()
  })

  test('valid E.164 phone submit POSTs to the API with the SMS channel', async () => {
    ;(api.invitations.create as jest.Mock).mockResolvedValue(
      makeInvitation({ channel: 'SMS', email: null, phone: '+15551234567' }),
    )
    const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any)

    const { getByTestId } = render(<InviteFriendScreen />)
    fireEvent.press(getByTestId('channel-chip-SMS'))
    fireEvent.changeText(getByTestId('invite-phone-input'), '+15551234567')
    fireEvent.press(getByTestId('send-invite-button'))

    await waitFor(() => {
      expect(api.invitations.create).toHaveBeenCalledWith({
        channel: 'SMS',
        phone: '+15551234567',
      })
    })
    shareSpy.mockRestore()
  })

  test('API failure surfaces the server error and leaves the success card hidden', async () => {
    ;(api.invitations.create as jest.Mock).mockRejectedValue(
      new Error('An invitation is already pending for that email.'),
    )

    const { getByTestId, findByTestId, queryByTestId } = render(<InviteFriendScreen />)
    fireEvent.changeText(getByTestId('invite-email-input'), 'friend@example.com')
    fireEvent.press(getByTestId('send-invite-button'))

    const errorNode = await findByTestId('invite-error')
    expect(errorNode.props.children).toMatch(/already pending/i)
    expect(queryByTestId('invite-success-card')).toBeNull()
  })

  test('Share again button re-opens the share sheet with the same code', async () => {
    ;(api.invitations.create as jest.Mock).mockResolvedValue(makeInvitation())
    const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any)

    const { getByTestId, findByTestId } = render(<InviteFriendScreen />)
    fireEvent.changeText(getByTestId('invite-email-input'), 'friend@example.com')
    fireEvent.press(getByTestId('send-invite-button'))

    await findByTestId('invite-success-card')
    shareSpy.mockClear()

    fireEvent.press(getByTestId('share-again-button'))
    await waitFor(() => expect(shareSpy).toHaveBeenCalledTimes(1))
    const shareCall = shareSpy.mock.calls[0][0] as { message: string }
    expect(shareCall.message).toContain('A3X9KF')

    shareSpy.mockRestore()
  })

  test('Done button after success calls navigation.goBack', async () => {
    ;(api.invitations.create as jest.Mock).mockResolvedValue(makeInvitation())
    jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any)

    const { getByTestId, findByTestId } = render(<InviteFriendScreen />)
    fireEvent.changeText(getByTestId('invite-email-input'), 'friend@example.com')
    fireEvent.press(getByTestId('send-invite-button'))

    await findByTestId('invite-success-card')
    fireEvent.press(getByTestId('invite-done-button'))
    expect(mockGoBack).toHaveBeenCalled()
  })

  test('Invite someone else resets the form and re-shows the send button', async () => {
    ;(api.invitations.create as jest.Mock).mockResolvedValue(makeInvitation())
    jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any)

    const { getByTestId, findByTestId, queryByTestId } = render(<InviteFriendScreen />)
    fireEvent.changeText(getByTestId('invite-email-input'), 'friend@example.com')
    fireEvent.press(getByTestId('send-invite-button'))

    await findByTestId('invite-success-card')
    fireEvent.press(getByTestId('send-another-button'))
    expect(queryByTestId('invite-success-card')).toBeNull()
    expect(getByTestId('send-invite-button')).toBeTruthy()
    expect(getByTestId('invite-email-input').props.value).toBe('')
  })
})
