/**
 * LoginScreen tests
 *
 * T2:  Valid credentials call login() — navigation is handled by RootNavigator
 *      reacting to the user state change, not by the screen itself.
 * T10: Bad credentials surface "Invalid email or password." error text.
 */

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import LoginScreen from '../src/screens/LoginScreen'

jest.mock('../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}))

import { useAuth } from '../src/context/AuthContext'

describe('LoginScreen', () => {
  const mockLogin = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useAuth as jest.Mock).mockReturnValue({
      user: null,
      isLoading: false,
      login: mockLogin,
      logout: jest.fn(),
    })
  })

  test('T2: valid credentials call login() with the correct email and password', async () => {
    mockLogin.mockResolvedValue(undefined)

    const { getByPlaceholderText, getByText } = render(<LoginScreen />)

    fireEvent.changeText(getByPlaceholderText('Email'), 'coach@gym.com')
    fireEvent.changeText(getByPlaceholderText('Password'), 'SecurePass1!')
    fireEvent.press(getByText('Sign In'))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('coach@gym.com', 'SecurePass1!')
    })
  })

  test('T2b: submitting empty fields shows required-field error without calling login()', async () => {
    const { getByText } = render(<LoginScreen />)

    fireEvent.press(getByText('Sign In'))

    await waitFor(() => {
      expect(getByText('Email and password are required.')).toBeTruthy()
    })
    expect(mockLogin).not.toHaveBeenCalled()
  })

  test('T10: failed login shows "Invalid email or password." error message', async () => {
    mockLogin.mockRejectedValue(new Error('Unauthorized'))

    const { getByPlaceholderText, getByText, findByText } = render(<LoginScreen />)

    fireEvent.changeText(getByPlaceholderText('Email'), 'bad@email.com')
    fireEvent.changeText(getByPlaceholderText('Password'), 'wrongpassword')
    fireEvent.press(getByText('Sign In'))

    await findByText('Invalid email or password.')
  })
})
