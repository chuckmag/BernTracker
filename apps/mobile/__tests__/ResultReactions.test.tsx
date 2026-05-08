import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import ResultReactions from '../src/components/ResultReactions'

jest.mock('../src/lib/api', () => ({
  api: {
    social: {
      reactions: {
        listForResult: jest.fn(),
        addToResult: jest.fn(),
        removeFromResult: jest.fn(),
      },
    },
  },
}))

jest.mock('../src/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      accent: '#5FD4D0',
      cardBg: '#111827',
      borderInteractive: '#374151',
      textTertiary: '#9ca3af',
      primary: '#5B9BE6',
    },
    isDark: true,
  }),
}))

import { api } from '../src/lib/api'

const LIST_MOCK = api.social.reactions.listForResult as jest.Mock
const ADD_MOCK = api.social.reactions.addToResult as jest.Mock
const REMOVE_MOCK = api.social.reactions.removeFromResult as jest.Mock

const RESULT_ID = 'result-1'

describe('ResultReactions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    LIST_MOCK.mockResolvedValue([])
  })

  it('renders without crashing and shows all 6 emojis', async () => {
    const { getAllByRole } = render(<ResultReactions resultId={RESULT_ID} />)
    await waitFor(() => {
      expect(getAllByRole('button').length).toBeGreaterThanOrEqual(6)
    })
  })

  it('shows reaction count when reactions exist', async () => {
    LIST_MOCK.mockResolvedValue([{ emoji: '🔥', count: 3, userReacted: false }])
    const { findByText } = render(<ResultReactions resultId={RESULT_ID} />)
    expect(await findByText('3')).toBeTruthy()
  })

  it('calls addToResult when an unreacted emoji is tapped', async () => {
    ADD_MOCK.mockResolvedValue({ added: true, emoji: '🔥', count: 1, userReacted: true })
    LIST_MOCK.mockResolvedValue([])
    const { getAllByRole } = render(<ResultReactions resultId={RESULT_ID} />)
    await waitFor(() => getAllByRole('button'))

    const buttons = getAllByRole('button')
    fireEvent.press(buttons[0])

    await waitFor(() => expect(ADD_MOCK).toHaveBeenCalledWith(RESULT_ID, '🔥'))
  })

  it('calls removeFromResult when a reacted emoji is tapped', async () => {
    LIST_MOCK.mockResolvedValue([{ emoji: '🔥', count: 2, userReacted: true }])
    REMOVE_MOCK.mockResolvedValue(undefined)
    const { getAllByRole } = render(<ResultReactions resultId={RESULT_ID} />)
    await waitFor(() => getAllByRole('button'))

    const buttons = getAllByRole('button')
    fireEvent.press(buttons[0])

    await waitFor(() => expect(REMOVE_MOCK).toHaveBeenCalledWith(RESULT_ID, '🔥'))
  })

  it('renders comment pill when onCommentPress is provided', async () => {
    const onPress = jest.fn()
    const { getAllByRole } = render(
      <ResultReactions resultId={RESULT_ID} onCommentPress={onPress} commentCount={5} />,
    )
    await waitFor(() => {
      const buttons = getAllByRole('button')
      expect(buttons.length).toBeGreaterThanOrEqual(7)
    })
  })

  it('calls onCommentPress when comment pill is tapped', async () => {
    const onPress = jest.fn()
    const { getAllByRole } = render(
      <ResultReactions resultId={RESULT_ID} onCommentPress={onPress} commentCount={2} />,
    )
    await waitFor(() => getAllByRole('button'))

    const buttons = getAllByRole('button')
    fireEvent.press(buttons[buttons.length - 1])
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
