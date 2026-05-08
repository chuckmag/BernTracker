import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ResultReactions from './ResultReactions'

vi.mock('../lib/api.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    api: {
      social: {
        reactions: {
          listForResult: vi.fn().mockResolvedValue([]),
          addToResult: vi.fn().mockResolvedValue({}),
          removeFromResult: vi.fn().mockResolvedValue(undefined),
        },
      },
    },
  }
})

import { api } from '../lib/api.ts'

const LIST_MOCK = api.social.reactions.listForResult as unknown as ReturnType<typeof vi.fn>
const ADD_MOCK = api.social.reactions.addToResult as unknown as ReturnType<typeof vi.fn>

const RESULT_ID = 'result-1'
const USER_ID = 'user-1'

function renderComponent(onCommentClick = vi.fn()) {
  return render(
    <ResultReactions resultId={RESULT_ID} currentUserId={USER_ID} onCommentClick={onCommentClick} />,
  )
}

describe('ResultReactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    LIST_MOCK.mockResolvedValue([])
  })

  test('renders without crashing', () => {
    renderComponent()
    expect(screen.getByLabelText('Add reaction')).toBeInTheDocument()
    expect(screen.getByLabelText('Open comments')).toBeInTheDocument()
  })

  test('fetches reactions on mount', async () => {
    renderComponent()
    await waitFor(() => expect(LIST_MOCK).toHaveBeenCalledWith(RESULT_ID))
  })

  test('shows reaction pills for existing reactions', async () => {
    LIST_MOCK.mockResolvedValue([
      { emoji: '👍', count: 3, userReacted: false },
      { emoji: '🔥', count: 1, userReacted: true },
    ])
    renderComponent()
    await waitFor(() => expect(screen.getByLabelText(/👍 3 reaction/)).toBeInTheDocument())
    expect(screen.getByLabelText(/🔥 1 reaction/)).toBeInTheDocument()
  })

  test('highlights pills where userReacted is true', async () => {
    LIST_MOCK.mockResolvedValue([{ emoji: '❤️', count: 2, userReacted: true }])
    renderComponent()
    const pill = await screen.findByLabelText(/❤️/)
    expect(pill).toHaveAttribute('aria-pressed', 'true')
  })

  test('opens emoji picker on add-reaction button click', async () => {
    const user = userEvent.setup()
    renderComponent()
    await user.click(screen.getByLabelText('Add reaction'))
    expect(screen.getByRole('listbox', { name: 'Emoji picker' })).toBeInTheDocument()
  })

  test('calls addToResult when picking an emoji', async () => {
    const user = userEvent.setup()
    renderComponent()
    await user.click(screen.getByLabelText('Add reaction'))
    const picker = screen.getByRole('listbox', { name: 'Emoji picker' })
    const firstEmoji = picker.querySelector('button')!
    await user.click(firstEmoji)
    expect(ADD_MOCK).toHaveBeenCalledWith(RESULT_ID, '👍')
  })

  test('calls onCommentClick when comment icon is clicked', async () => {
    const user = userEvent.setup()
    const onCommentClick = vi.fn()
    renderComponent(onCommentClick)
    await user.click(screen.getByLabelText('Open comments'))
    expect(onCommentClick).toHaveBeenCalledOnce()
  })
})
