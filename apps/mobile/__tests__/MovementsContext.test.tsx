/**
 * MovementsContext — auth-gated catalog fetch (slice 3a follow-up).
 *
 * Regression coverage for the bug where MovementsProvider raced
 * AuthProvider's async SecureStore read on app launch: the fetch fired
 * before `_accessToken` was populated, the API returned 401, the silent
 * .catch left the catalog permanently empty.
 */

import React from 'react'
import { render, act, waitFor } from '@testing-library/react-native'
import { Text } from 'react-native'

jest.mock('../src/lib/api', () => ({
  api: {
    movements: { list: jest.fn() },
  },
}))

// Stub useAuth so the test can flip user state in/out and verify the
// catalog fetch follows. AuthProvider itself is too heavy (SecureStore,
// /api/auth/me round-trip) to spin up here.
let mockUser: { id: string } | null = null
jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, isLoading: false }),
}))

import { MovementsProvider, useMovements } from '../src/context/MovementsContext'
import { api } from '../src/lib/api'

function CatalogProbe() {
  const movements = useMovements()
  return <Text>count={movements.length}</Text>
}

describe('MovementsContext', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUser = null
  })

  test('does not fetch the catalog while logged out', () => {
    mockUser = null
    render(
      <MovementsProvider>
        <CatalogProbe />
      </MovementsProvider>,
    )
    // No user → no fetch. This is the race fix: previously the provider
    // fired immediately and hit the API tokenless during AuthProvider's
    // SecureStore load.
    expect(api.movements.list).not.toHaveBeenCalled()
  })

  test('fetches the catalog once the user becomes available, then exposes it via useMovements()', async () => {
    ;(api.movements.list as jest.Mock).mockResolvedValue([
      { id: 'mv-thr', name: 'Thruster' },
      { id: 'mv-pu', name: 'Pull-up' },
    ])
    mockUser = { id: 'u-1' }
    const { findByText } = render(
      <MovementsProvider>
        <CatalogProbe />
      </MovementsProvider>,
    )
    await waitFor(() => expect(api.movements.list).toHaveBeenCalledTimes(1))
    await findByText('count=2')
  })

  test('clears the catalog on logout so a stale list never bleeds across sessions', async () => {
    ;(api.movements.list as jest.Mock).mockResolvedValue([
      { id: 'mv-thr', name: 'Thruster' },
    ])
    mockUser = { id: 'u-1' }
    const { findByText, rerender } = render(
      <MovementsProvider>
        <CatalogProbe />
      </MovementsProvider>,
    )
    await findByText('count=1')

    // Simulate logout → useAuth().user goes null → provider drops the cache.
    mockUser = null
    rerender(
      <MovementsProvider>
        <CatalogProbe />
      </MovementsProvider>,
    )
    await findByText('count=0')
  })

  test('re-fetches when a different user logs in (login → out → in)', async () => {
    ;(api.movements.list as jest.Mock).mockResolvedValueOnce([{ id: 'mv-1', name: 'A' }])
    mockUser = { id: 'u-1' }
    const { findByText, rerender } = render(
      <MovementsProvider>
        <CatalogProbe />
      </MovementsProvider>,
    )
    await findByText('count=1')

    // Logout, then log in as a different user.
    mockUser = null
    rerender(<MovementsProvider><CatalogProbe /></MovementsProvider>)
    await findByText('count=0')

    ;(api.movements.list as jest.Mock).mockResolvedValueOnce([
      { id: 'mv-2', name: 'B' },
      { id: 'mv-3', name: 'C' },
    ])
    mockUser = { id: 'u-2' }
    rerender(<MovementsProvider><CatalogProbe /></MovementsProvider>)
    await waitFor(() => expect(api.movements.list).toHaveBeenCalledTimes(2))
    await findByText('count=2')
  })

  test('a failed fetch leaves the catalog empty (consumer falls back to detect-only flow)', async () => {
    ;(api.movements.list as jest.Mock).mockRejectedValue(new Error('Unauthorized'))
    mockUser = { id: 'u-1' }
    const { findByText } = render(
      <MovementsProvider>
        <CatalogProbe />
      </MovementsProvider>,
    )
    await waitFor(() => expect(api.movements.list).toHaveBeenCalled())
    // Empty catalog is the documented fallback — server-side detect still
    // works because the server has its own canonical movement DB.
    await findByText('count=0')
  })
})
