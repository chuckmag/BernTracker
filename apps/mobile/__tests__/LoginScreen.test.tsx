/**
 * LoginScreen tests
 *
 * Covers the Keycloak PKCE flow: Sign In triggers promptStandard, Sign in
 * with Google triggers promptGoogle (kc_idp_hint via separate useAuthRequest),
 * successful code exchange calls loginWithTokens, and auth errors surface.
 *
 * useAuthRequest is called twice per render — once for the standard flow,
 * once for Google. mockReturnValueOnce is used to configure each call in order.
 * Each test calls setupHooks() explicitly so the queue is always fresh
 * (resetAllMocks clears the queue in beforeEach).
 */

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import LoginScreen from '../src/screens/LoginScreen'

jest.mock('expo-auth-session', () => ({
  useAuthRequest: jest.fn(),
  exchangeCodeAsync: jest.fn(),
  makeRedirectUri: jest.fn(() => 'com.wodalytics.app://'),
}))

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}))

jest.mock('../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}))

jest.mock('../src/lib/keycloak', () => ({
  CLIENT_ID: 'wodalytics-mobile',
  discovery: {
    authorizationEndpoint: 'https://qa.wodalytics.com/auth/realms/wodalytics/protocol/openid-connect/auth',
    tokenEndpoint: 'https://qa.wodalytics.com/auth/realms/wodalytics/protocol/openid-connect/token',
  },
}))

import { useAuth } from '../src/context/AuthContext'
import * as AuthSession from 'expo-auth-session'

const mockLoginWithTokens = jest.fn()
const mockPromptStandard = jest.fn()
const mockPromptGoogle = jest.fn()

const STD_REQUEST = { codeVerifier: 'verifier-std' }
const GOOGLE_REQUEST = { codeVerifier: 'verifier-google' }

// Configures useAuthRequest for the two hook calls per render.
// Uses mockImplementation with a counter so re-renders (which call both hooks
// again) continue to return the correct values without exhausting a Once queue.
function setupHooks(stdResponse: unknown = null, googleResponse: unknown = null) {
  let callCount = 0
  ;(AuthSession.useAuthRequest as jest.Mock).mockImplementation(() => {
    callCount++
    return callCount % 2 === 1
      ? [STD_REQUEST, stdResponse, mockPromptStandard]
      : [GOOGLE_REQUEST, googleResponse, mockPromptGoogle]
  })
}

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    ;(useAuth as jest.Mock).mockReturnValue({
      user: null,
      isLoading: false,
      loginWithTokens: mockLoginWithTokens,
      logout: jest.fn(),
    })
  })

  test('renders Sign In and Sign in with Google buttons', () => {
    setupHooks()
    const { getByText } = render(<LoginScreen />)
    expect(getByText('Sign In')).toBeTruthy()
    expect(getByText('Sign in with Google')).toBeTruthy()
  })

  test('Sign In button calls promptStandard (no kc_idp_hint)', async () => {
    setupHooks()
    const { getByText } = render(<LoginScreen />)
    fireEvent.press(getByText('Sign In'))

    await waitFor(() => {
      expect(mockPromptStandard).toHaveBeenCalledTimes(1)
      expect(mockPromptGoogle).not.toHaveBeenCalled()
    })
  })

  test('Sign in with Google button calls promptGoogle (kc_idp_hint via request config)', async () => {
    setupHooks()
    const { getByText } = render(<LoginScreen />)
    fireEvent.press(getByText('Sign in with Google'))

    await waitFor(() => {
      expect(mockPromptGoogle).toHaveBeenCalledTimes(1)
      expect(mockPromptStandard).not.toHaveBeenCalled()
    })
  })

  test('successful standard response exchanges code and calls loginWithTokens', async () => {
    ;(AuthSession.exchangeCodeAsync as jest.Mock).mockResolvedValue({
      accessToken: 'kc-access-token',
      refreshToken: 'kc-refresh-token',
    })
    setupHooks({ type: 'success', params: { code: 'auth-code-123' } }, null)

    render(<LoginScreen />)

    await waitFor(() => {
      expect(AuthSession.exchangeCodeAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'auth-code-123',
          extraParams: { code_verifier: 'verifier-std' },
        }),
        expect.anything(),
      )
      expect(mockLoginWithTokens).toHaveBeenCalledWith('kc-access-token', 'kc-refresh-token')
    })
  })

  test('successful Google response exchanges code with Google verifier', async () => {
    ;(AuthSession.exchangeCodeAsync as jest.Mock).mockResolvedValue({
      accessToken: 'google-access-token',
      refreshToken: 'google-refresh-token',
    })
    setupHooks(null, { type: 'success', params: { code: 'google-code-456' } })

    render(<LoginScreen />)

    await waitFor(() => {
      expect(AuthSession.exchangeCodeAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'google-code-456',
          extraParams: { code_verifier: 'verifier-google' },
        }),
        expect.anything(),
      )
      expect(mockLoginWithTokens).toHaveBeenCalledWith('google-access-token', 'google-refresh-token')
    })
  })

  test('error response type shows error message', async () => {
    setupHooks({ type: 'error', error: { description: 'access_denied' } }, null)

    const { findByText } = render(<LoginScreen />)
    await findByText('access_denied')
  })

  test('cancel response type shows no error', async () => {
    setupHooks({ type: 'cancel' }, null)

    const { queryByText } = render(<LoginScreen />)
    await waitFor(() => {
      expect(queryByText(/failed/i)).toBeNull()
    })
  })

  test('failed code exchange shows error without calling loginWithTokens', async () => {
    ;(AuthSession.exchangeCodeAsync as jest.Mock).mockRejectedValue(new Error('Token exchange failed'))
    setupHooks({ type: 'success', params: { code: 'bad-code' } }, null)

    const { findByText } = render(<LoginScreen />)
    await findByText('Token exchange failed')
    expect(mockLoginWithTokens).not.toHaveBeenCalled()
  })
})
