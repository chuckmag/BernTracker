import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CommentThread from './CommentThread'
import type { Comment } from '../lib/api'

vi.mock('../context/AuthContext.tsx', () => ({
  useAuth: () => ({
    user: { id: 'user-1', firstName: 'Test', lastName: 'User', avatarUrl: null },
  }),
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
const CURRENT_USER = 'user-1'

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

function renderThread() {
  return render(<CommentThread resultId={RESULT_ID} currentUserId={CURRENT_USER} />)
}

describe('CommentThread', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    LIST_MOCK.mockResolvedValue({ comments: [], total: 0, page: 1, limit: 20, pages: 1 })
  })

  test('renders without crashing, shows loading then empty state', async () => {
    renderThread()
    expect(screen.getByPlaceholderText('Add a comment…')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('No comments yet. Be the first!')).toBeInTheDocument())
  })

  test('shows comment body and author name after loading', async () => {
    LIST_MOCK.mockResolvedValue({
      comments: [makeComment()],
      total: 1, page: 1, limit: 20, pages: 1,
    })
    renderThread()
    await waitFor(() => expect(screen.getByText('Great workout!')).toBeInTheDocument())
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
  })

  test('shows [deleted] for soft-deleted comments', async () => {
    LIST_MOCK.mockResolvedValue({
      comments: [makeComment({ body: null, user: null, deletedAt: '2026-05-02T00:00:00.000Z' })],
      total: 1, page: 1, limit: 20, pages: 1,
    })
    renderThread()
    await waitFor(() => expect(screen.getByText('[deleted]')).toBeInTheDocument())
    expect(screen.getByText('Deleted')).toBeInTheDocument()
  })

  test('shows comment count in section header', async () => {
    LIST_MOCK.mockResolvedValue({
      comments: [makeComment()],
      total: 7, page: 1, limit: 20, pages: 1,
    })
    renderThread()
    await waitFor(() => expect(screen.getByText('(7)')).toBeInTheDocument())
  })

  test('shows own comment Edit and Delete buttons', async () => {
    LIST_MOCK.mockResolvedValue({
      comments: [makeComment({ user: { id: CURRENT_USER, firstName: 'Me', lastName: null, avatarUrl: null } })],
      total: 1, page: 1, limit: 20, pages: 1,
    })
    renderThread()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  test('does not show Edit/Delete for other users\' comments', async () => {
    LIST_MOCK.mockResolvedValue({
      comments: [makeComment({ user: { id: 'someone-else', firstName: 'Jane', lastName: 'Doe', avatarUrl: null } })],
      total: 1, page: 1, limit: 20, pages: 1,
    })
    renderThread()
    await waitFor(() => expect(screen.getByText('Great workout!')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  test('submits a new comment on Post click', async () => {
    const user = userEvent.setup()
    CREATE_MOCK.mockResolvedValue(makeComment({ id: 'c-new', body: 'Hello!' }))
    renderThread()
    await waitFor(() => screen.getByPlaceholderText('Add a comment…'))
    await user.type(screen.getByPlaceholderText('Add a comment…'), 'Hello!')
    await user.click(screen.getByRole('button', { name: 'Post' }))
    expect(CREATE_MOCK).toHaveBeenCalledWith(RESULT_ID, 'Hello!')
  })

  test('renders compose textarea and Post button', () => {
    renderThread()
    expect(screen.getByPlaceholderText('Add a comment…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Post' })).toBeInTheDocument()
  })
})
