import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CommentPanel from './CommentPanel'
import type { Comment } from '../lib/api'

vi.mock('../context/AuthContext.tsx', () => ({
  useAuth: () => ({ user: { id: 'user-1', name: 'Me' } }),
}))

vi.mock('../lib/api.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    api: {
      social: {
        comments: {
          list: vi.fn().mockResolvedValue({ comments: [], total: 0, page: 1, limit: 20, pages: 1 }),
          create: vi.fn(),
          reply: vi.fn(),
          edit: vi.fn(),
          remove: vi.fn(),
        },
        reactions: {
          addToComment: vi.fn().mockResolvedValue({}),
          removeFromComment: vi.fn().mockResolvedValue(undefined),
        },
      },
    },
  }
})

import { api } from '../lib/api.ts'

const LIST_MOCK = api.social.comments.list as unknown as ReturnType<typeof vi.fn>
const CREATE_MOCK = api.social.comments.create as unknown as ReturnType<typeof vi.fn>

const RESULT_ID = 'result-1'

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    resultId: RESULT_ID,
    parentId: null,
    body: 'Great workout!',
    deletedAt: null,
    createdAt: '2026-05-01T10:00:00.000Z',
    updatedAt: '2026-05-01T10:00:00.000Z',
    user: { id: 'user-2', firstName: 'Jane', lastName: 'Doe', avatarUrl: null },
    reactions: [],
    replies: [],
    replyCount: 0,
    ...overrides,
  }
}

function renderPanel(onClose = vi.fn()) {
  return render(<CommentPanel resultId={RESULT_ID} onClose={onClose} />)
}

describe('CommentPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    LIST_MOCK.mockResolvedValue({ comments: [], total: 0, page: 1, limit: 20, pages: 1 })
  })

  test('renders without crashing and shows loading state', () => {
    LIST_MOCK.mockReturnValue(new Promise(() => {}))
    renderPanel()
    expect(screen.getByRole('dialog', { name: 'Comments' })).toBeInTheDocument()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  test('shows empty state when no comments', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('No comments yet. Be the first!')).toBeInTheDocument())
  })

  test('shows comment body and author name after loading', async () => {
    LIST_MOCK.mockResolvedValue({
      comments: [makeComment()],
      total: 1, page: 1, limit: 20, pages: 1,
    })
    renderPanel()
    await waitFor(() => expect(screen.getByText('Great workout!')).toBeInTheDocument())
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
  })

  test('shows [deleted] for soft-deleted comments', async () => {
    LIST_MOCK.mockResolvedValue({
      comments: [makeComment({ body: null, user: null, deletedAt: '2026-05-02T00:00:00.000Z' })],
      total: 1, page: 1, limit: 20, pages: 1,
    })
    renderPanel()
    await waitFor(() => expect(screen.getByText('[deleted]')).toBeInTheDocument())
    expect(screen.getByText('Deleted')).toBeInTheDocument()
  })

  test('shows comment count in header', async () => {
    LIST_MOCK.mockResolvedValue({
      comments: [makeComment()],
      total: 5, page: 1, limit: 20, pages: 1,
    })
    renderPanel()
    await waitFor(() => expect(screen.getByText('(5)')).toBeInTheDocument())
  })

  test('renders compose box', () => {
    renderPanel()
    expect(screen.getByPlaceholderText('Add a comment…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Post' })).toBeInTheDocument()
  })

  test('shows own comment edit and delete buttons', async () => {
    LIST_MOCK.mockResolvedValue({
      comments: [makeComment({ user: { id: 'user-1', firstName: 'Me', lastName: null, avatarUrl: null } })],
      total: 1, page: 1, limit: 20, pages: 1,
    })
    renderPanel()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  test('submits a new comment on Post click', async () => {
    const user = userEvent.setup()
    CREATE_MOCK.mockResolvedValue(makeComment({ id: 'c-new', body: 'Hello!' }))
    renderPanel()
    await waitFor(() => screen.getByPlaceholderText('Add a comment…'))
    await user.type(screen.getByPlaceholderText('Add a comment…'), 'Hello!')
    await user.click(screen.getByRole('button', { name: 'Post' }))
    expect(CREATE_MOCK).toHaveBeenCalledWith(RESULT_ID, 'Hello!')
  })

  test('calls onClose when × is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderPanel(onClose)
    await user.click(screen.getByLabelText('Close comments'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  test('calls onClose on Escape key', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderPanel(onClose)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })
})
