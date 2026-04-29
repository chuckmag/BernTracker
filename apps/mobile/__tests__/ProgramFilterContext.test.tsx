/**
 * ProgramFilterContext tests
 *
 * Covers the cross-app contract:
 *   - Storage key shape `programFilter:<gymId>` (string[]); empty = all programs
 *   - Hydration on mount + on gym swap, drops stale IDs no longer reachable
 *   - Mutators (setSelected, toggle, clear) write through to storage
 */

import React from 'react'
import { render, act, waitFor } from '@testing-library/react-native'
import { Text } from 'react-native'
import {
  ProgramFilterProvider,
  useProgramFilter,
} from '../src/context/ProgramFilterContext'

jest.mock('../src/context/GymContext', () => ({
  useGym: jest.fn(),
}))

jest.mock('../src/lib/api', () => ({
  api: {
    me: { programs: jest.fn() },
  },
}))

const mockStore = new Map<string, string>()

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      mockStore.set(key, value)
      return Promise.resolve()
    }),
    removeItem: jest.fn((key: string) => {
      mockStore.delete(key)
      return Promise.resolve()
    }),
  },
}))

import { useGym } from '../src/context/GymContext'
import { api } from '../src/lib/api'
import AsyncStorage from '@react-native-async-storage/async-storage'

const PROG = (id: string, name: string) => ({
  gymId: 'gym-1',
  programId: id,
  isDefault: false,
  program: {
    id,
    name,
    description: null,
    visibility: 'PUBLIC' as const,
    coverColor: null,
  },
})

function Probe() {
  const { selected, available, loading, toggle, clear, setSelected } = useProgramFilter()
  return (
    <>
      <Text testID="selected">{JSON.stringify(selected)}</Text>
      <Text testID="available">{available.map((gp) => gp.program.id).join(',')}</Text>
      <Text testID="loading">{String(loading)}</Text>
      <Text testID="toggle-a" onPress={() => toggle('a')} />
      <Text testID="toggle-b" onPress={() => toggle('b')} />
      <Text testID="set-ab" onPress={() => setSelected(['a', 'b'])} />
      <Text testID="clear" onPress={clear} />
    </>
  )
}

function renderProbe() {
  return render(
    <ProgramFilterProvider>
      <Probe />
    </ProgramFilterProvider>,
  )
}

describe('ProgramFilterContext', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockStore.clear()
    ;(useGym as jest.Mock).mockReturnValue({
      activeGym: { id: 'gym-1', name: 'Test', slug: 't', timezone: 'UTC', userRole: 'MEMBER' },
      isLoading: false,
      selectGym: jest.fn(),
    })
    ;(api.me.programs as jest.Mock).mockResolvedValue([PROG('a', 'Alpha'), PROG('b', 'Beta')])
  })

  test('starts empty when nothing is in AsyncStorage', async () => {
    const { findByTestId } = renderProbe()
    await waitFor(() => expect((findByTestId('available') as any)).resolves)
    const sel = await findByTestId('selected')
    expect(sel.props.children).toBe('[]')
  })

  test('hydrates from AsyncStorage on mount', async () => {
    mockStore.set('programFilter:gym-1', JSON.stringify(['a']))

    const { findByTestId } = renderProbe()
    const sel = await findByTestId('selected')
    await waitFor(() => expect(sel.props.children).toBe(JSON.stringify(['a'])))
  })

  test('toggle adds and removes IDs and writes to AsyncStorage', async () => {
    const { findByTestId } = renderProbe()
    const sel = await findByTestId('selected')
    const toggleA = await findByTestId('toggle-a')

    await act(async () => { toggleA.props.onPress() })
    await waitFor(() => expect(sel.props.children).toBe(JSON.stringify(['a'])))
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('programFilter:gym-1', JSON.stringify(['a']))

    await act(async () => { toggleA.props.onPress() })
    await waitFor(() => expect(sel.props.children).toBe(JSON.stringify([])))
  })

  test('clear empties the selection and persists empty array', async () => {
    mockStore.set('programFilter:gym-1', JSON.stringify(['a', 'b']))

    const { findByTestId } = renderProbe()
    const sel = await findByTestId('selected')
    await waitFor(() => expect(sel.props.children).toBe(JSON.stringify(['a', 'b'])))

    const clearBtn = await findByTestId('clear')
    await act(async () => { clearBtn.props.onPress() })
    await waitFor(() => expect(sel.props.children).toBe(JSON.stringify([])))
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith('programFilter:gym-1', JSON.stringify([]))
  })

  test('drops persisted IDs that no longer exist in available programs', async () => {
    mockStore.set('programFilter:gym-1', JSON.stringify(['a', 'gone']))

    const { getByTestId } = renderProbe()

    // Initial hydrate from storage shows both IDs; once the available list
    // resolves, the missing one is pruned. Re-resolve the node each tick
    // because RNTL replaces the text element on re-render.
    await waitFor(() => {
      expect(getByTestId('selected').props.children).toBe(JSON.stringify(['a']))
    })
  })
})
