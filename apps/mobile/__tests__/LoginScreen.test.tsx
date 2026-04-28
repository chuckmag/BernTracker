/**
 * LoginScreen tests
 *
 * Covers the login form: email/password submit, empty-field guard,
 * bad-credentials error, and the server-side Google OAuth flow
 * (success, missing tokens, error, user cancel).
 */

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import LoginScreen from '../src/screens/LoginScreen'

jest.mock('../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}))

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}))

jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'com.berntracker.app:///auth-callback'),
  parse: jest.fn(),
}))

import { useAuth } from '../src/context/AuthContext'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'

describe('LoginScreen', () => {
  const mockLogin = jest.fn()
  const mockLoginWithGoogle = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useAuth as jest.Mock).mockReturnValue({
      user: null,
      isLoading: false,
      login: mockLogin,
      loginWithGoogle: mockLoginWithGoogle,
      logout: jest.fn(),
    })
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

  test('Google sign-in opens server-side auth URL with mobile_redirect param', async () => {
    ;(WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'dismiss' })

    const { getByText } = render(<LoginScreen />)
    fireEvent.press(getByText('Sign in with Google'))

    await waitFor(() => {
      expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledTimes(1)
    })
    const [authUrl, redirectUrl] = (WebBrowser.openAuthSessionAsync as jest.Mock).mock.calls[0]
    expect(authUrl).toContain('/api/auth/google?mobile_redirect=')
    expect(authUrl).toContain(encodeURIComponent('com.berntracker.app:///auth-callback'))
    expect(redirectUrl).toBe('com.berntracker.app:///auth-callback')
  })

  test('successful redirect parses tokens and calls loginWithGoogle', async () => {
    ;(WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'com.berntracker.app:///auth-callback?token=acc-1&refreshToken=ref-1',
    })
    ;(Linking.parse as jest.Mock).mockReturnValue({
      queryParams: { token: 'acc-1', refreshToken: 'ref-1' },
    })

    const { getByText } = render(<LoginScreen />)
    fireEvent.press(getByText('Sign in with Google'))

    await waitFor(() => {
      expect(mockLoginWithGoogle).toHaveBeenCalledWith('acc-1', 'ref-1')
    })
  })

  test('redirect missing tokens shows error without calling loginWithGoogle', async () => {
    ;(WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'com.berntracker.app:///auth-callback',
    })
    ;(Linking.parse as jest.Mock).mockReturnValue({ queryParams: {} })

    const { getByText, findByText } = render(<LoginScreen />)
    fireEvent.press(getByText('Sign in with Google'))

    await findByText('Google sign-in failed — no tokens returned.')
    expect(mockLoginWithGoogle).not.toHaveBeenCalled()
  })

  test('user cancelling the auth session does not show an error', async () => {
    ;(WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'cancel' })

    const { getByText, queryByText } = render(<LoginScreen />)
    fireEvent.press(getByText('Sign in with Google'))

    await waitFor(() => {
      expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalled()
    })
    expect(queryByText(/Google sign-in failed/)).toBeNull()
    expect(mockLoginWithGoogle).not.toHaveBeenCalled()
  })

  test('non-success result type (e.g. locked) shows generic Google error', async () => {
    ;(WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'locked' })

    const { getByText, findByText } = render(<LoginScreen />)
    fireEvent.press(getByText('Sign in with Google'))

    await findByText('Google sign-in failed. Please try again.')
    expect(mockLoginWithGoogle).not.toHaveBeenCalled()
  })
})
