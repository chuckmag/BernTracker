/**
 * ProgramFilterPicker tests
 *
 * Covers label states, modal toggle behavior, and clear interaction.
 */

import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import ProgramFilterPicker from '../src/components/ProgramFilterPicker'

const mockNavigate = jest.fn()

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}))

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

  test('shows a Browse-programs entry point even when no programs are available', () => {
    // Empty state pivots to a "Browse programs" chevron so first-run members
    // can still reach the public catalog (#507).
    setContext({ available: [], loading: false })
    const { queryByTestId, getByTestId } = render(<ProgramFilterPicker />)
    expect(queryByTestId('program-filter-button')).toBeNull()
    const browse = getByTestId('program-filter-browse-empty')
    fireEvent.press(browse)
    expect(mockNavigate).toHaveBeenCalledWith('BrowsePrograms')
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

  test('"Browse public programs" footer navigates to BrowsePrograms and closes the modal', () => {
    setContext({ available: [PROG('a', 'Alpha')] })

    const { getByTestId, queryByTestId } = render(<ProgramFilterPicker />)
    fireEvent.press(getByTestId('program-filter-button'))
    fireEvent.press(getByTestId('program-filter-browse'))
    expect(mockNavigate).toHaveBeenCalledWith('BrowsePrograms')
    // The Done button (only rendered inside the open modal) disappears after
    // the footer press because goToBrowse() closes the modal.
    expect(queryByTestId('program-filter-done')).toBeNull()
  })
})
