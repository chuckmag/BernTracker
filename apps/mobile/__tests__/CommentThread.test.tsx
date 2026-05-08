import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import CommentThread from '../src/components/CommentThread'
import type { Comment } from '../src/lib/api'

jest.mock('../src/lib/api', () => ({
  api: {
    social: {
      comments: {
        list: jest.fn(),
        create: jest.fn(),
        edit: jest.fn(),
        remove: jest.fn(),
        reply: jest.fn(),
      },
    },
  },
}))

jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', firstName: 'Test', lastName: 'User', email: 'test@example.com', name: 'Test User', identifiedGender: null },
  }),
}))

jest.mock('../src/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      textPrimary: '#ffffff',
      textSecondary: '#d1d5db',
      textTertiary: '#9ca3af',
      textPlaceholder: '#6b7280',
      borderInteractive: '#374151',
      borderSubtle: '#1f2937',
      inputBg: '#1f2937',
      cardBg: '#111827',
      primary: '#5B9BE6',
      errorText: '#fb7185',
      accent: '#5FD4D0',
    },
    isDark: true,
  }),
}))

import { api } from '../src/lib/api'

const LIST_MOCK = api.social.comments.list as jest.Mock
const CREATE_MOCK = api.social.comments.create as jest.Mock

const RESULT_ID = 'result-1'
const CURRENT_USER_ID = 'user-1'

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    resultId: RESULT_ID,
    parentId: null,
    body: 'Great workout!',
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    user: { id: 'user-2', firstName: 'Jane', lastName: 'Doe', avatarUrl: null },
    reactions: [],
    replies: [],
    replyCount: 0,
    ...overrides,
  }
}

describe('CommentThread', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    LIST_MOCK.mockResolvedValue({ comments: [], total: 0, page: 1, limit: 20, pages: 1 })
  })

  it('renders without crashing and shows compose input', async () => {
    const { findByTestId } = render(<CommentThread resultId={RESULT_ID} />)
    expect(await findByTestId('compose-input')).toBeTruthy()
    expect(await findByTestId('post-button')).toBeTruthy()
  })

  it('shows empty state when no comments', async () => {
    const { findByText } = render(<CommentThread resultId={RESULT_ID} />)
    expect(await findByText('No comments yet. Be the first!')).toBeTruthy()
  })

  it('shows comment body and author name after loading', async () => {
    LIST_MOCK.mockResolvedValue({
      comments: [makeComment()],
      total: 1, page: 1, limit: 20, pages: 1,
    })
    const { findByText } = render(<CommentThread resultId={RESULT_ID} />)
    expect(await findByText('Great workout!')).toBeTruthy()
    expect(await findByText('Jane Doe')).toBeTruthy()
  })

  it('shows [deleted] for soft-deleted comments', async () => {
    LIST_MOCK.mockResolvedValue({
      comments: [makeComment({ body: null, user: null, deletedAt: new Date().toISOString() })],
      total: 1, page: 1, limit: 20, pages: 1,
    })
    const { findByText } = render(<CommentThread resultId={RESULT_ID} />)
    expect(await findByText('[deleted]')).toBeTruthy()
    expect(await findByText('Deleted')).toBeTruthy()
  })

  it('shows comment count in heading', async () => {
    LIST_MOCK.mockResolvedValue({
      comments: [makeComment()],
      total: 7, page: 1, limit: 20, pages: 1,
    })
    const { findByText } = render(<CommentThread resultId={RESULT_ID} />)
    expect(await findByText('Comments (7)')).toBeTruthy()
  })

  it('shows Edit and Delete for own comments', async () => {
    LIST_MOCK.mockResolvedValue({
      comments: [makeComment({ user: { id: CURRENT_USER_ID, firstName: 'Test', lastName: 'User', avatarUrl: null } })],
      total: 1, page: 1, limit: 20, pages: 1,
    })
    const { findByText } = render(<CommentThread resultId={RESULT_ID} />)
    expect(await findByText('Edit')).toBeTruthy()
    expect(await findByText('Delete')).toBeTruthy()
  })

  it('does not show Edit/Delete for others\' comments', async () => {
    LIST_MOCK.mockResolvedValue({
      comments: [makeComment({ user: { id: 'someone-else', firstName: 'Jane', lastName: 'Doe', avatarUrl: null } })],
      total: 1, page: 1, limit: 20, pages: 1,
    })
    const { queryByText, findByText } = render(<CommentThread resultId={RESULT_ID} />)
    await findByText('Jane Doe')
    expect(queryByText('Edit')).toBeNull()
    expect(queryByText('Delete')).toBeNull()
  })

  it('calls create when Post is pressed with non-empty text', async () => {
    CREATE_MOCK.mockResolvedValue(makeComment({ id: 'c-new', body: 'Hello!' }))
    const { findByTestId, getByTestId } = render(<CommentThread resultId={RESULT_ID} />)

    const input = await findByTestId('compose-input')
    fireEvent.changeText(input, 'Hello!')
    fireEvent.press(getByTestId('post-button'))

    await waitFor(() => expect(CREATE_MOCK).toHaveBeenCalledWith(RESULT_ID, 'Hello!'))
  })
})
