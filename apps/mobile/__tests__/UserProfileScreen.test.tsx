import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import UserProfileScreen from '../src/screens/UserProfileScreen'

jest.mock('../src/lib/api', () => ({
  api: {
    users: { public: jest.fn() },
  },
}))

import { api } from '../src/lib/api'

function makeRoute(userId = 'user-1') {
  return { params: { userId } } as any
}

const navigation = { setOptions: jest.fn(), goBack: jest.fn() } as any

function makeProfile(overrides = {}) {
  return {
    id: 'user-1',
    firstName: 'Jane',
    lastName: 'Doe',
    name: null,
    avatarUrl: null,
    ...overrides,
  }
}

describe('UserProfileScreen', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders the display name after load', async () => {
    jest.mocked(api.users.public).mockResolvedValue(makeProfile())
    const { getByText } = render(<UserProfileScreen route={makeRoute()} navigation={navigation} />)
    await waitFor(() => expect(getByText('Jane Doe')).toBeTruthy())
  })

  it('falls back to name when firstName/lastName are null', async () => {
    jest.mocked(api.users.public).mockResolvedValue(
      makeProfile({ firstName: null, lastName: null, name: 'jdoe' }),
    )
    const { getByText } = render(<UserProfileScreen route={makeRoute()} navigation={navigation} />)
    await waitFor(() => expect(getByText('jdoe')).toBeTruthy())
  })

  it('shows an error when the API rejects', async () => {
    jest.mocked(api.users.public).mockRejectedValue(new Error('User not found'))
    const { getByText } = render(<UserProfileScreen route={makeRoute()} navigation={navigation} />)
    await waitFor(() => expect(getByText('User not found')).toBeTruthy())
  })
})
