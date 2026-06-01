import React from 'react'
import { Alert } from 'react-native'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import SettingsScreen from '../src/screens/SettingsScreen'

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
        profile: {
          get: jest.fn(),
          update: jest.fn(),
        },
      },
    },
  },
}))

jest.mock('../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}))

// Mock BirthdayField with a TextInput so the screen test can drive its
// value/onChange contract via fireEvent.changeText — the native date picker
// is exercised in its own unit test (BirthdayField.test.tsx).
jest.mock('../src/components/BirthdayField', () => {
  const { TextInput } = jest.requireActual('react-native')
  return {
    __esModule: true,
    default: ({ value, onChange, testID }: { value: string; onChange: (next: string) => void; testID?: string }) => (
      <TextInput value={value} onChangeText={onChange} testID={testID} />
    ),
  }
})

const mockSetMode = jest.fn()
// Replace the whole theme module rather than requireActual'ing it — that
// avoids importing AsyncStorage at the type-only `ThemeMode` re-export site
// when the test runs without the native module bound.
jest.mock('../src/lib/theme', () => ({
  __esModule: true,
  useTheme: () => ({
    mode: 'system',
    setMode: mockSetMode,
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

const mockLogout = jest.fn().mockResolvedValue(undefined)

function profileFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'u1',
    email: 'test@example.com',
    name: 'Alex Doe',
    firstName: 'Alex',
    lastName: 'Doe',
    birthday: '1990-04-15',
    identifiedGender: 'NON_BINARY',
    avatarUrl: null,
    onboardedAt: '2026-01-01T00:00:00.000Z',
    role: 'MEMBER',
    preferredLoadUnit: 'LB',
    preferredDistanceUnit: 'M',
    emergencyContacts: [],
    ...overrides,
  }
}

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useAuth as jest.Mock).mockReturnValue({
      user: { id: 'u1' },
      isLoading: false,
      loginWithTokens: jest.fn(),
      logout: mockLogout,
    })
  })

  test('renders pre-filled values from GET /api/users/me/profile', async () => {
    ;(api.users.me.profile.get as jest.Mock).mockResolvedValue(profileFixture())

    const { findByDisplayValue, findByText } = render(<SettingsScreen />)

    await findByDisplayValue('Alex')
    await findByDisplayValue('Doe')
    await findByDisplayValue('1990-04-15')
    await findByText('test@example.com')
  })

  test('Save calls PATCH with trimmed name + selected gender', async () => {
    ;(api.users.me.profile.get as jest.Mock).mockResolvedValue(profileFixture({ identifiedGender: null }))
    ;(api.users.me.profile.update as jest.Mock).mockResolvedValue(profileFixture({ identifiedGender: 'FEMALE' }))

    const { findByTestId, findByText } = render(<SettingsScreen />)

    fireEvent.changeText(await findByTestId('first-name-input'), '  Sam  ')
    fireEvent.press(await findByTestId('gender-chip-FEMALE'))
    fireEvent.press(await findByTestId('save-button'))

    await waitFor(() => {
      expect(api.users.me.profile.update).toHaveBeenCalledWith({
        firstName: 'Sam',
        lastName: 'Doe',
        birthday: '1990-04-15',
        identifiedGender: 'FEMALE',
      })
    })
    await findByText('Saved.')
  })

  test('theme chip taps call ThemeProvider.setMode', async () => {
    ;(api.users.me.profile.get as jest.Mock).mockResolvedValue(profileFixture())

    const { findByTestId } = render(<SettingsScreen />)

    fireEvent.press(await findByTestId('theme-chip-light'))
    expect(mockSetMode).toHaveBeenCalledWith('light')

    fireEvent.press(await findByTestId('theme-chip-dark'))
    expect(mockSetMode).toHaveBeenCalledWith('dark')
  })

  test('sign-out shows confirmation Alert; confirming calls logout()', async () => {
    ;(api.users.me.profile.get as jest.Mock).mockResolvedValue(profileFixture())

    // Capture the Alert.alert button handler so we can simulate "Sign out".
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      const signOut = buttons?.find((b) => b.text === 'Sign out')
      signOut?.onPress?.()
    })

    const { findByTestId } = render(<SettingsScreen />)
    fireEvent.press(await findByTestId('sign-out-button'))

    expect(alertSpy).toHaveBeenCalled()
    await waitFor(() => expect(mockLogout).toHaveBeenCalled())
    alertSpy.mockRestore()
  })

  test('failed profile load surfaces an error and hides the form', async () => {
    ;(api.users.me.profile.get as jest.Mock).mockRejectedValue(new Error('offline'))

    const { findByText, queryByTestId } = render(<SettingsScreen />)

    await findByText('offline')
    expect(queryByTestId('save-button')).toBeNull()
  })
})
