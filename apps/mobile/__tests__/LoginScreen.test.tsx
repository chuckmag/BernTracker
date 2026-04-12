/**
 * LoginScreen tests
 *
 * Covers the login form: email/password submit, empty-field guard,
 * bad-credentials error, and Google OAuth sign-in (success and failure).
 * Navigation after login is handled by RootNavigator reacting to
 * the auth context user state change, not by the screen itself.
 */

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import LoginScreen from '../src/screens/LoginScreen'

jest.mock('../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}))

jest.mock('expo-auth-session/providers/google', () => ({
  useAuthRequest: jest.fn(),
}))

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}))

import { useAuth } from '../src/context/AuthContext'
import * as Google from 'expo-auth-session/providers/google'

describe('LoginScreen', () => {
  const mockLogin = jest.fn()
  const mockLoginWithGoogle = jest.fn()
  const mockPromptAsync = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useAuth as jest.Mock).mockReturnValue({
      user: null,
      isLoading: false,
      login: mockLogin,
      loginWithGoogle: mockLoginWithGoogle,
      logout: jest.fn(),
    })
    // Default: request ready, no response yet
    ;(Google.useAuthRequest as jest.Mock).mockReturnValue([{}, null, mockPromptAsync])
  })

  test('valid credentials call login() with the correct email and password', async () => {
    mockLogin.mockResolvedValue(undefined)

    const { getByPlaceholderText, getByText } = render(<LoginScreen />)

    fireEvent.changeText(getByPlaceholderText('Email'), 'coach@gym.com')
    fireEvent.changeText(getByPlaceholderText('Password'), 'SecurePass1!')
    fireEvent.press(getByText('Sign In'))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('coach@gym.com', 'SecurePass1!')
    })
  })

  test('submitting empty fields shows required-field error without calling login()', async () => {
    const { getByText } = render(<LoginScreen />)

    fireEvent.press(getByText('Sign In'))

    await waitFor(() => {
      expect(getByText('Email and password are required.')).toBeTruthy()
    })
    expect(mockLogin).not.toHaveBeenCalled()
  })

  test('failed login shows "Invalid email or password." error message', async () => {
    mockLogin.mockRejectedValue(new Error('Unauthorized'))

    const { getByPlaceholderText, getByText, findByText } = render(<LoginScreen />)

    fireEvent.changeText(getByPlaceholderText('Email'), 'bad@email.com')
    fireEvent.changeText(getByPlaceholderText('Password'), 'wrongpassword')
    fireEvent.press(getByText('Sign In'))

    await findByText('Invalid email or password.')
  })

  test('pressing "Sign in with Google" calls promptAsync', async () => {
    mockPromptAsync.mockResolvedValue({ type: 'dismissed' })

    const { getByText } = render(<LoginScreen />)

    fireEvent.press(getByText('Sign in with Google'))

    await waitFor(() => {
      expect(mockPromptAsync).toHaveBeenCalled()
    })
  })

  test('successful Google response calls loginWithGoogle with the ID token', async () => {
    mockLoginWithGoogle.mockResolvedValue(undefined)
    ;(Google.useAuthRequest as jest.Mock).mockReturnValue([
      {},
      { type: 'success', authentication: { idToken: 'google-id-token-abc' } },
      mockPromptAsync,
    ])

    render(<LoginScreen />)

    await waitFor(() => {
      expect(mockLoginWithGoogle).toHaveBeenCalledWith('google-id-token-abc')
    })
  })

  test('Google response with missing ID token shows error without calling loginWithGoogle', async () => {
    ;(Google.useAuthRequest as jest.Mock).mockReturnValue([
      {},
      { type: 'success', authentication: {} },
      mockPromptAsync,
    ])

    const { findByText } = render(<LoginScreen />)

    await findByText('Google sign-in failed — no ID token received.')
    expect(mockLoginWithGoogle).not.toHaveBeenCalled()
  })

  test('Google error response shows error message', async () => {
    ;(Google.useAuthRequest as jest.Mock).mockReturnValue([
      {},
      { type: 'error', error: new Error('access_denied') },
      mockPromptAsync,
    ])

    const { findByText } = render(<LoginScreen />)

    await findByText('Google sign-in failed. Please try again.')
  })
})
