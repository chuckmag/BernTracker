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

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}))

jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'exp://127.0.0.1:8081/--/auth-callback'),
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
    ;(WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'dismiss' })
    ;(Linking.parse as jest.Mock).mockReturnValue({ queryParams: {} })
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

  test('pressing "Sign in with Google" opens the API OAuth URL in a browser', async () => {
    const { getByText } = render(<LoginScreen />)

    fireEvent.press(getByText('Sign in with Google'))

    await waitFor(() => {
      expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/google?mobile_redirect='),
        'exp://127.0.0.1:8081/--/auth-callback',
      )
    })
  })

  test('successful Google callback calls loginWithGoogle with the access and refresh tokens', async () => {
    ;(WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'exp://127.0.0.1:8081/--/auth-callback?token=acc123&refreshToken=ref456',
    })
    ;(Linking.parse as jest.Mock).mockReturnValue({
      queryParams: { token: 'acc123', refreshToken: 'ref456' },
    })
    mockLoginWithGoogle.mockResolvedValue(undefined)

    const { getByText } = render(<LoginScreen />)
    fireEvent.press(getByText('Sign in with Google'))

    await waitFor(() => {
      expect(mockLoginWithGoogle).toHaveBeenCalledWith('acc123', 'ref456')
    })
  })

  test('Google callback missing tokens shows error without calling loginWithGoogle', async () => {
    ;(WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'exp://127.0.0.1:8081/--/auth-callback',
    })
    ;(Linking.parse as jest.Mock).mockReturnValue({ queryParams: {} })

    const { getByText, findByText } = render(<LoginScreen />)
    fireEvent.press(getByText('Sign in with Google'))

    await findByText('Google sign-in failed — no token received.')
    expect(mockLoginWithGoogle).not.toHaveBeenCalled()
  })

  test('dismissed Google browser does not show an error', async () => {
    ;(WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'cancel' })

    const { getByText, queryByText } = render(<LoginScreen />)
    fireEvent.press(getByText('Sign in with Google'))

    await waitFor(() => {
      expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalled()
    })
    expect(queryByText(/Google sign-in failed/)).toBeNull()
    expect(mockLoginWithGoogle).not.toHaveBeenCalled()
  })
})
