import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { useImageUpload, IMAGE_ACCEPT_WITH_HEIC } from './useImageUpload'

function Harness({ onFile, accept }: { onFile: (f: File) => void; accept?: string }) {
  const { inputProps, open, error } = useImageUpload({
    ariaLabel: 'pick',
    accept,
    onFile,
  })
  return (
    <>
      <input {...inputProps} data-testid="picker" />
      <button type="button" onClick={open}>open</button>
      {error && <p>{error}</p>}
    </>
  )
}

describe('useImageUpload', () => {
  it('forwards a valid file to onFile', async () => {
    const onFile = vi.fn()
    render(<Harness onFile={onFile} />)
    const file = new File(['x'], 'small.png', { type: 'image/png' })
    await userEvent.upload(screen.getByTestId('picker'), file)
    expect(onFile).toHaveBeenCalledWith(file)
  })

  it('rejects files larger than the cap and skips onFile', async () => {
    const onFile = vi.fn()
    render(<Harness onFile={onFile} />)
    const big = new File([new Uint8Array(21 * 1024 * 1024)], 'big.png', { type: 'image/png' })
    await userEvent.upload(screen.getByTestId('picker'), big)
    expect(await screen.findByText(/too large/i)).toBeInTheDocument()
    expect(await screen.findByText(/Max is 20MB/)).toBeInTheDocument()
    expect(onFile).not.toHaveBeenCalled()
  })

  it('uses the supplied accept attribute (e.g. HEIC variant)', () => {
    render(<Harness onFile={vi.fn()} accept={IMAGE_ACCEPT_WITH_HEIC} />)
    expect(screen.getByTestId('picker')).toHaveAttribute('accept', IMAGE_ACCEPT_WITH_HEIC)
  })
})
