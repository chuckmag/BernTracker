import React from 'react'
import { Alert, Platform } from 'react-native'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import AvatarUploader from '../src/components/AvatarUploader'

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}))

jest.mock('../src/lib/api', () => ({
  api: {
    users: {
      me: {
        avatar: { upload: jest.fn(), remove: jest.fn() },
      },
    },
  },
}))

jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }))

import * as ImagePicker from 'expo-image-picker'
import { api } from '../src/lib/api'
import { useAuth } from '../src/context/AuthContext'

const mockRefreshUser = jest.fn().mockResolvedValue(undefined)

function setUser(overrides: Partial<{ avatarUrl: string | null }> = {}) {
  ;(useAuth as jest.Mock).mockReturnValue({
    user: {
      id: 'u1',
      email: 'a@test.com',
      firstName: 'Alex',
      lastName: 'Doe',
      name: 'Alex Doe',
      avatarUrl: null,
      ...overrides,
    },
    refreshUser: mockRefreshUser,
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  // Force Android branch — Alert.alert-based options sheet is easier to drive
  // than iOS's ActionSheetIOS in tests; both paths route to handleSource().
  Platform.OS = 'android'
})

describe('AvatarUploader', () => {
  test('renders nothing when no user is signed in', () => {
    ;(useAuth as jest.Mock).mockReturnValue({ user: null, refreshUser: mockRefreshUser })
    const { queryByTestId } = render(<AvatarUploader />)
    expect(queryByTestId('avatar-uploader')).toBeNull()
  })

  test('uploads after a successful library pick and refreshes the user', async () => {
    setUser()
    ;(ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true })
    ;(ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/x.jpg', mimeType: 'image/jpeg', fileName: 'x.jpg' }],
    })
    ;(api.users.me.avatar.upload as jest.Mock).mockResolvedValue({ avatarUrl: '/avatars/u1.webp' })

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === 'Choose from Library')?.onPress?.()
    })

    const { getByTestId } = render(<AvatarUploader />)
    fireEvent.press(getByTestId('avatar-uploader'))

    await waitFor(() => {
      expect(api.users.me.avatar.upload).toHaveBeenCalledWith({
        uri: 'file:///tmp/x.jpg',
        name: 'x.jpg',
        mimeType: 'image/jpeg',
      })
    })
    expect(mockRefreshUser).toHaveBeenCalled()
    alertSpy.mockRestore()
  })

  test('surfaces a permission error when the library permission is denied', async () => {
    setUser()
    ;(ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false })

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === 'Choose from Library')?.onPress?.()
    })

    const { getByTestId, findByTestId } = render(<AvatarUploader />)
    fireEvent.press(getByTestId('avatar-uploader'))

    const errorNode = await findByTestId('avatar-uploader-error')
    expect(errorNode).toBeTruthy()
    expect(api.users.me.avatar.upload).not.toHaveBeenCalled()
    alertSpy.mockRestore()
  })

  test('canceling the image picker is a no-op', async () => {
    setUser()
    ;(ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true })
    ;(ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: [] })

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === 'Take Photo')?.onPress?.()
    })

    const { getByTestId } = render(<AvatarUploader />)
    fireEvent.press(getByTestId('avatar-uploader'))

    await waitFor(() => expect(ImagePicker.launchCameraAsync).toHaveBeenCalled())
    expect(api.users.me.avatar.upload).not.toHaveBeenCalled()
    expect(mockRefreshUser).not.toHaveBeenCalled()
    alertSpy.mockRestore()
  })

  test('removing the existing photo calls api.remove + refreshUser', async () => {
    setUser({ avatarUrl: '/avatars/old.webp' })
    ;(api.users.me.avatar.remove as jest.Mock).mockResolvedValue(undefined)

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === 'Remove Photo')?.onPress?.()
    })

    const { getByTestId } = render(<AvatarUploader />)
    fireEvent.press(getByTestId('avatar-uploader'))

    await waitFor(() => expect(api.users.me.avatar.remove).toHaveBeenCalled())
    expect(mockRefreshUser).toHaveBeenCalled()
    alertSpy.mockRestore()
  })

  test('hides "Remove Photo" option when the user has no avatar', () => {
    setUser({ avatarUrl: null })
    const presented: string[][] = []
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      presented.push((buttons ?? []).map((b) => b.text ?? ''))
    })

    const { getByTestId } = render(<AvatarUploader />)
    fireEvent.press(getByTestId('avatar-uploader'))

    expect(presented[0]).toEqual(['Take Photo', 'Choose from Library', 'Cancel'])
    alertSpy.mockRestore()
  })
})
