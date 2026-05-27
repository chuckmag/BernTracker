import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import AvatarHeaderButton from '../src/components/AvatarHeaderButton'

const mockNavigate = jest.fn()
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}))

jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }))

import { useAuth } from '../src/context/AuthContext'

describe('AvatarHeaderButton', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('renders nothing when no user is signed in', () => {
    ;(useAuth as jest.Mock).mockReturnValue({ user: null })
    const { queryByTestId } = render(<AvatarHeaderButton />)
    expect(queryByTestId('avatar-header-button')).toBeNull()
  })

  test('shows initials fallback when the user has no avatarUrl', () => {
    ;(useAuth as jest.Mock).mockReturnValue({
      user: { id: 'u1', email: 'a@test.com', firstName: 'Alex', lastName: 'Doe', name: 'Alex Doe', avatarUrl: null },
    })
    const { getByText, getByTestId } = render(<AvatarHeaderButton />)
    expect(getByTestId('avatar-header-button')).toBeTruthy()
    expect(getByText('AD')).toBeTruthy()
  })

  test('tap navigates to Settings on the root stack', () => {
    ;(useAuth as jest.Mock).mockReturnValue({
      user: { id: 'u1', email: 'a@test.com', firstName: 'Alex', lastName: 'Doe', name: 'Alex Doe', avatarUrl: null },
    })
    const { getByTestId } = render(<AvatarHeaderButton />)
    fireEvent.press(getByTestId('avatar-header-button'))
    expect(mockNavigate).toHaveBeenCalledWith('Settings')
  })
})
