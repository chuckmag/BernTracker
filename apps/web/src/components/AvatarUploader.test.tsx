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
    isWodalyticsAdmin: false,
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

// Replace the cropper modal with a deterministic stub so the test can drive
// Save / Cancel without exercising react-easy-crop's pointer events or canvas
// (neither plays well with jsdom).
vi.mock('./AvatarCropper', () => ({
  default: ({ onSave, onCancel, saving, imageSrc }: {
    onSave: (b: Blob) => void | Promise<void>
    onCancel: () => void
    saving?: boolean
    imageSrc: string
  }) => (
    <div role="dialog" aria-label="Crop your photo">
      <span data-testid="cropper-src">{imageSrc}</span>
      <button onClick={() => onSave(new Blob(['cropped'], { type: 'image/jpeg' }))} disabled={saving}>
        Save photo
      </button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}))

import { api } from '../lib/api'

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.user.avatarUrl = null
  vi.mocked(api.auth.me).mockResolvedValue({ ...mockAuth.user, avatarUrl: '/uploads/avatars/u1/x.webp' })
  // jsdom doesn't ship a real Object URL implementation; stub it.
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = vi.fn(() => 'blob:mock')
    URL.revokeObjectURL = vi.fn()
  }
})

describe('AvatarUploader', () => {
  it('shows "Upload photo" when there is no avatar', () => {
    render(<AvatarUploader />)
    expect(screen.getByRole('button', { name: /Upload photo/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
  })

  it('shows "Change photo" + Remove when an avatar is set', () => {
    mockAuth.user.avatarUrl = '/uploads/avatars/u1/existing.webp'
    render(<AvatarUploader />)
    expect(screen.getByRole('button', { name: /Change photo/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Remove/ })).toBeInTheDocument()
  })

  it('opens the cropper after picking a file (no upload yet)', async () => {
    render(<AvatarUploader />)
    const user = userEvent.setup()
    const file = new File(['fake-bytes'], 'me.jpg', { type: 'image/jpeg' })
    const input = screen.getByLabelText('Choose a profile photo') as HTMLInputElement
    await user.upload(input, file)
    expect(await screen.findByRole('dialog', { name: /Crop your photo/ })).toBeInTheDocument()
    expect(api.users.me.avatar.upload).not.toHaveBeenCalled()
  })

  it('uploads only after the user clicks Save in the cropper', async () => {
    vi.mocked(api.users.me.avatar.upload).mockResolvedValue({ avatarUrl: '/uploads/avatars/u1/new.webp' })
    render(<AvatarUploader />)
    const user = userEvent.setup()
    const file = new File(['fake-bytes'], 'me.jpg', { type: 'image/jpeg' })
    const input = screen.getByLabelText('Choose a profile photo') as HTMLInputElement
    await user.upload(input, file)
    await user.click(await screen.findByRole('button', { name: /Save photo/ }))
    await waitFor(() => expect(api.users.me.avatar.upload).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(api.auth.me).toHaveBeenCalled())
  })

  it('rejects files larger than 20MB inline (no cropper, no API call)', async () => {
    render(<AvatarUploader />)
    const big = new File([new Uint8Array(21 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' })
    const input = screen.getByLabelText('Choose a profile photo') as HTMLInputElement
    const user = userEvent.setup()
    await user.upload(input, big)
    expect(await screen.findByText(/too large/i)).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /Crop your photo/ })).not.toBeInTheDocument()
    expect(api.users.me.avatar.upload).not.toHaveBeenCalled()
  })

  it('Cancel in the cropper closes it without uploading', async () => {
    render(<AvatarUploader />)
    const user = userEvent.setup()
    const file = new File(['fake-bytes'], 'me.jpg', { type: 'image/jpeg' })
    const input = screen.getByLabelText('Choose a profile photo') as HTMLInputElement
    await user.upload(input, file)
    await user.click(await screen.findByRole('button', { name: /Cancel/ }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Crop your photo/ })).not.toBeInTheDocument())
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
