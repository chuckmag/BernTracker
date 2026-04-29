import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import GymLogoUploader from './GymLogoUploader'

const refreshGyms = vi.fn().mockResolvedValue(undefined)

vi.mock('../context/GymContext.tsx', () => ({
  useGym: () => ({
    gyms: [],
    gymId: 'g1',
    gymRole: 'OWNER',
    setGymId: vi.fn(),
    refreshGyms,
    loading: false,
  }),
}))

vi.mock('../lib/api', () => ({
  api: {
    gyms: {
      logo: {
        upload: vi.fn(),
        remove: vi.fn(),
      },
    },
  },
}))

import { api } from '../lib/api'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GymLogoUploader', () => {
  it('shows "Upload logo" with no Remove button when there is no logo', () => {
    render(<GymLogoUploader gymId="g1" logoUrl={null} name="CrossFit Foo" />)
    expect(screen.getByRole('button', { name: /Upload logo/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
  })

  it('shows "Change logo" + Remove when a logo is set', () => {
    render(<GymLogoUploader gymId="g1" logoUrl="/uploads/gyms/g1/x.webp" name="CrossFit Foo" />)
    expect(screen.getByRole('button', { name: /Change logo/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Remove/ })).toBeInTheDocument()
  })

  it('uploads on file select, calls onChange, and refreshes gym context', async () => {
    vi.mocked(api.gyms.logo.upload).mockResolvedValue({ logoUrl: '/uploads/gyms/g1/new.webp' })
    const onChange = vi.fn()
    render(<GymLogoUploader gymId="g1" logoUrl={null} name="CrossFit Foo" onChange={onChange} />)
    const file = new File(['fake-bytes'], 'logo.png', { type: 'image/png' })
    const input = screen.getByLabelText('Choose a gym logo') as HTMLInputElement
    const user = userEvent.setup()
    await user.upload(input, file)
    await waitFor(() => expect(api.gyms.logo.upload).toHaveBeenCalledWith('g1', file))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('/uploads/gyms/g1/new.webp'))
    await waitFor(() => expect(refreshGyms).toHaveBeenCalled())
  })

  it('rejects files larger than 20MB inline (no API call)', async () => {
    render(<GymLogoUploader gymId="g1" logoUrl={null} name="CrossFit Foo" />)
    const big = new File([new Uint8Array(21 * 1024 * 1024)], 'big.png', { type: 'image/png' })
    const input = screen.getByLabelText('Choose a gym logo') as HTMLInputElement
    const user = userEvent.setup()
    await user.upload(input, big)
    expect(await screen.findByText(/too large/i)).toBeInTheDocument()
    expect(api.gyms.logo.upload).not.toHaveBeenCalled()
  })

  it('Remove button calls the delete endpoint, fires onChange(null), and refreshes', async () => {
    vi.mocked(api.gyms.logo.remove).mockResolvedValue(undefined)
    const onChange = vi.fn()
    render(
      <GymLogoUploader gymId="g1" logoUrl="/uploads/gyms/g1/existing.webp" name="CrossFit Foo" onChange={onChange} />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Remove/ }))
    await waitFor(() => expect(api.gyms.logo.remove).toHaveBeenCalledWith('g1'))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null))
    await waitFor(() => expect(refreshGyms).toHaveBeenCalled())
  })
})
