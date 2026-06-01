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

  it('renders an "Add reaction" affordance with the full 6-emoji picker hidden until pressed', async () => {
    const { findByLabelText, queryByLabelText, getAllByLabelText } = render(
      <ResultReactions resultId={RESULT_ID} />,
    )

    // Closed by default: add button is visible, picker buttons are not.
    const addButton = await findByLabelText('Add reaction')
    expect(queryByLabelText(/^React with /)).toBeNull()

    fireEvent.press(addButton)

    // After tapping, all 6 ALLOWED_EMOJIS are rendered as picker buttons.
    await waitFor(() => {
      expect(getAllByLabelText(/^React with /)).toHaveLength(6)
    })
  })

  it('shows reaction count when reactions exist', async () => {
    LIST_MOCK.mockResolvedValue([{ emoji: '🔥', count: 3, userReacted: false }])
    const { findByText } = render(<ResultReactions resultId={RESULT_ID} />)
    expect(await findByText('3')).toBeTruthy()
  })

  it('calls addToResult when an unreacted emoji is tapped from the picker', async () => {
    ADD_MOCK.mockResolvedValue({ added: true, emoji: '🔥', count: 1, userReacted: true })
    LIST_MOCK.mockResolvedValue([])
    const { findByLabelText } = render(<ResultReactions resultId={RESULT_ID} />)

    fireEvent.press(await findByLabelText('Add reaction'))
    fireEvent.press(await findByLabelText('React with 🔥'))

    await waitFor(() => expect(ADD_MOCK).toHaveBeenCalledWith(RESULT_ID, '🔥'))
  })

  it('calls removeFromResult when a reacted emoji pill is tapped', async () => {
    LIST_MOCK.mockResolvedValue([{ emoji: '🔥', count: 2, userReacted: true }])
    REMOVE_MOCK.mockResolvedValue(undefined)
    const { findByLabelText } = render(<ResultReactions resultId={RESULT_ID} />)

    // Active reactions render as standalone pills (not in the picker), so we
    // can target the 🔥 pill directly via its accessibility label.
    const pill = await findByLabelText(/🔥 2 reactions, tap to remove/)
    fireEvent.press(pill)

    await waitFor(() => expect(REMOVE_MOCK).toHaveBeenCalledWith(RESULT_ID, '🔥'))
  })

  it('renders comment pill when onCommentPress is provided', async () => {
    const onPress = jest.fn()
    const { findByLabelText } = render(
      <ResultReactions resultId={RESULT_ID} onCommentPress={onPress} commentCount={5} />,
    )
    expect(await findByLabelText(/5 comments, tap to view/)).toBeTruthy()
  })

  it('calls onCommentPress when comment pill is tapped', async () => {
    const onPress = jest.fn()
    const { findByLabelText } = render(
      <ResultReactions resultId={RESULT_ID} onCommentPress={onPress} commentCount={2} />,
    )

    fireEvent.press(await findByLabelText(/2 comments, tap to view/))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
