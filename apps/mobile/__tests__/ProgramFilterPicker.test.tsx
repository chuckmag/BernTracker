/**
 * ProgramFilterPicker tests
 *
 * Covers label states, modal toggle behavior, and clear interaction.
 */

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import ProgramFilterPicker from '../src/components/ProgramFilterPicker'

jest.mock('../src/context/ProgramFilterContext', () => ({
  useProgramFilter: jest.fn(),
}))

import { useProgramFilter } from '../src/context/ProgramFilterContext'

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

function setContext(overrides: Partial<ReturnType<typeof useProgramFilter>>) {
  ;(useProgramFilter as jest.Mock).mockReturnValue({
    selected: [],
    available: [],
    loading: false,
    setSelected: jest.fn(),
    toggle: jest.fn(),
    clear: jest.fn(),
    ...overrides,
  })
}

describe('ProgramFilterPicker', () => {
  beforeEach(() => jest.clearAllMocks())

  test('renders nothing when no programs are available', () => {
    setContext({ available: [], loading: false })
    const { queryByTestId } = render(<ProgramFilterPicker />)
    expect(queryByTestId('program-filter-button')).toBeNull()
  })

  test('label is "All programs" with empty selection', () => {
    setContext({ available: [PROG('a', 'CrossFit'), PROG('b', 'Yoga')], selected: [] })
    const { getByText } = render(<ProgramFilterPicker />)
    expect(getByText('All programs')).toBeTruthy()
  })

  test('label shows the single selected program name', () => {
    setContext({ available: [PROG('a', 'CrossFit'), PROG('b', 'Yoga')], selected: ['a'] })
    const { getByText } = render(<ProgramFilterPicker />)
    expect(getByText('CrossFit')).toBeTruthy()
  })

  test('label shows "<Name> + N more" for multi-select', () => {
    setContext({
      available: [PROG('a', 'CrossFit'), PROG('b', 'Yoga'), PROG('c', 'Strength')],
      selected: ['a', 'b', 'c'],
    })
    const { getByText } = render(<ProgramFilterPicker />)
    expect(getByText('CrossFit + 2 more')).toBeTruthy()
  })

  test('tapping a row calls toggle with the program id', async () => {
    const toggle = jest.fn()
    setContext({ available: [PROG('a', 'Alpha')], toggle })

    const { getByTestId } = render(<ProgramFilterPicker />)
    fireEvent.press(getByTestId('program-filter-button'))
    fireEvent.press(getByTestId('program-row-a'))
    expect(toggle).toHaveBeenCalledWith('a')
  })

  test('Clear button calls clear', () => {
    const clear = jest.fn()
    setContext({ available: [PROG('a', 'Alpha')], selected: ['a'], clear })

    const { getByTestId } = render(<ProgramFilterPicker />)
    fireEvent.press(getByTestId('program-filter-button'))
    fireEvent.press(getByTestId('program-filter-clear'))
    expect(clear).toHaveBeenCalled()
  })
})
