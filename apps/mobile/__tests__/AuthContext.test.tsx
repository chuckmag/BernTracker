/**
 * AuthContext tests
 *
 * T1: App opens with no stored session → user is null (LoginScreen would be shown).
 * T3: App starts with valid stored tokens → session is restored and user is set
 *     (Feed would be shown — RootNavigator reads user from this context).
 */

import React from 'react'
import { render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { AuthProvider, useAuth } from '../src/context/AuthContext'

// Mock the api module — AuthContext calls these functions directly.
jest.mock('../src/lib/api', () => ({
  api: {
    auth: { me: jest.fn() },
  },
  setAccessToken: jest.fn(),
  setUnauthorizedHandler: jest.fn(),
  storeTokens: jest.fn(),
  getStoredTokens: jest.fn(),
  clearTokens: jest.fn(),
}))

import { api, getStoredTokens } from '../src/lib/api'

// A minimal consumer that exposes auth state as text so we can assert on it.
function AuthConsumer() {
  const { user, isLoading } = useAuth()
  if (isLoading) return <Text testID="status">loading</Text>
  if (!user) return <Text testID="status">not-logged-in</Text>
  return <Text testID="status">{`logged-in:${user.id}`}</Text>
}

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('T1: no stored tokens → user is null after initialisation', async () => {
    ;(getStoredTokens as jest.Mock).mockResolvedValue({
      accessToken: null,
      refreshToken: null,
    })

    const { findByTestId } = render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    )

    const el = await findByTestId('status')
    expect(el.props.children).toBe('not-logged-in')
  })

  test('T3: valid stored tokens → session restored, user populated from api.auth.me', async () => {
    ;(getStoredTokens as jest.Mock).mockResolvedValue({
      accessToken: 'valid-access-token',
      refreshToken: 'valid-refresh-token',
    })
    ;(api.auth.me as jest.Mock).mockResolvedValue({
      id: 'user-123',
      email: 'member@gym.com',
      name: 'Jane Doe',
    })

    const { findByTestId } = render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    )

    const el = await findByTestId('status')
    expect(el.props.children).toBe('logged-in:user-123')
  })
})
