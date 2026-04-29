import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import AvatarUploader from './AvatarUploader'

const mockAuth = {
  user: {
    id: 'u1',
    email: 'a@test.com',
    name: 'Alice',
    firstName: 'Alice',
    lastName: 'Anderson',
    birthday: null,
    avatarUrl: null as string | null,
    onboardedAt: '2026-01-01T00:00:00.000Z',
    role: 'MEMBER' as const,
    identifiedGender: null,
    isMovementReviewer: false,
  },
  accessToken: 'tok',
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(),
}

vi.mock('../context/AuthContext.tsx', () => ({
  useAuth: () => mockAuth,
}))

vi.mock('../lib/api', () => ({
  api: {
    users: {
      me: {
        avatar: {
          upload: vi.fn(),
          remove: vi.fn(),
        },
      },
    },
    auth: { me: vi.fn() },
  },
}))

import { api } from '../lib/api'

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.user.avatarUrl = null
  vi.mocked(api.auth.me).mockResolvedValue({ ...mockAuth.user, avatarUrl: '/uploads/avatars/u1/x.webp' })
})

describe('AvatarUploader', () => {
  it('shows "Upload photo" when there is no avatar', () => {
    render(<AvatarUploader />)
    expect(screen.getByRole('button', { name: /Upload photo/ })).toBeInTheDocument()
    // No Remove button when there's nothing to remove
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
  })

  it('shows "Change photo" + Remove when an avatar is set', () => {
    mockAuth.user.avatarUrl = '/uploads/avatars/u1/existing.webp'
    render(<AvatarUploader />)
    expect(screen.getByRole('button', { name: /Change photo/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Remove/ })).toBeInTheDocument()
  })

  it('uploads on file select and refreshes the user', async () => {
    vi.mocked(api.users.me.avatar.upload).mockResolvedValue({ avatarUrl: '/uploads/avatars/u1/new.webp' })
    render(<AvatarUploader />)
    const user = userEvent.setup()
    const file = new File(['fake-bytes'], 'me.jpg', { type: 'image/jpeg' })
    const input = screen.getByLabelText('Choose a profile photo') as HTMLInputElement
    await user.upload(input, file)
    await waitFor(() => expect(api.users.me.avatar.upload).toHaveBeenCalledWith(file))
    await waitFor(() => expect(api.auth.me).toHaveBeenCalled())
  })

  it('rejects files larger than 5MB inline (no API call)', async () => {
    render(<AvatarUploader />)
    const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' })
    const input = screen.getByLabelText('Choose a profile photo') as HTMLInputElement
    const user = userEvent.setup()
    await user.upload(input, big)
    expect(await screen.findByText(/too large/i)).toBeInTheDocument()
    expect(api.users.me.avatar.upload).not.toHaveBeenCalled()
  })

  it('Remove button calls the delete endpoint and refreshes', async () => {
    mockAuth.user.avatarUrl = '/uploads/avatars/u1/existing.webp'
    vi.mocked(api.users.me.avatar.remove).mockResolvedValue(undefined)
    render(<AvatarUploader />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Remove/ }))
    await waitFor(() => expect(api.users.me.avatar.remove).toHaveBeenCalled())
    await waitFor(() => expect(api.auth.me).toHaveBeenCalled())
  })
})
