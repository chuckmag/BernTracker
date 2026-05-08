import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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
        comments: {
          list: vi.fn().mockResolvedValue({ comments: [], total: 0, page: 1, limit: 20, pages: 1 }),
        },
      },
    },
  }
})

import { api } from '../lib/api.ts'

const LIST_MOCK = api.social.reactions.listForResult as unknown as ReturnType<typeof vi.fn>
const ADD_MOCK = api.social.reactions.addToResult as unknown as ReturnType<typeof vi.fn>
const COMMENTS_MOCK = api.social.comments.list as unknown as ReturnType<typeof vi.fn>

const RESULT_ID = 'result-1'
const USER_ID = 'user-1'
const WORKOUT_ID = 'workout-1'

function renderComponent({ workoutId }: { workoutId?: string } = {}) {
  return render(
    <MemoryRouter>
      <ResultReactions resultId={RESULT_ID} currentUserId={USER_ID} workoutId={workoutId} />
    </MemoryRouter>,
  )
}

describe('ResultReactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    LIST_MOCK.mockResolvedValue([])
    COMMENTS_MOCK.mockResolvedValue({ comments: [], total: 0, page: 1, limit: 20, pages: 1 })
  })

  test('renders without crashing', () => {
    renderComponent()
    expect(screen.getByLabelText('Add reaction')).toBeInTheDocument()
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

  test('does not show comment link when workoutId is omitted', () => {
    renderComponent()
    expect(screen.queryByLabelText(/comment/i)).not.toBeInTheDocument()
  })

  test('shows comment link when workoutId is provided', async () => {
    COMMENTS_MOCK.mockResolvedValue({ comments: [], total: 5, page: 1, limit: 20, pages: 1 })
    renderComponent({ workoutId: WORKOUT_ID })
    await waitFor(() => expect(screen.getByLabelText(/5 comments/)).toBeInTheDocument())
  })

  test('fetches comment count when workoutId is provided', async () => {
    renderComponent({ workoutId: WORKOUT_ID })
    await waitFor(() => expect(COMMENTS_MOCK).toHaveBeenCalledWith(RESULT_ID, 1))
  })

  test('does not fetch comment count when workoutId is omitted', async () => {
    renderComponent()
    await waitFor(() => expect(LIST_MOCK).toHaveBeenCalled())
    expect(COMMENTS_MOCK).not.toHaveBeenCalled()
  })
})
