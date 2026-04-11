/**
 * AuthContext tests
 *
 * Tests the two startup paths: cold start with no session, and warm start with
 * stored tokens that restore the authenticated user without requiring login.
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

  test('no stored tokens → user is null after initialisation', async () => {
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

  test('valid stored tokens → session restored, user populated from api.auth.me', async () => {
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
