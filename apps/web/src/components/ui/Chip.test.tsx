import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import Chip from './Chip'

describe('Chip', () => {
  it('renders as a non-button span when no onToggle is supplied', () => {
    render(<Chip variant="accent">Today</Chip>)
    expect(screen.getByText('Today').tagName).toBe('SPAN')
  })

  it('renders each variant with its own off-state class', () => {
    const { rerender } = render(<Chip variant="neutral">x</Chip>)
    expect(screen.getByText('x')).toHaveClass('bg-gray-800')

    rerender(<Chip variant="accent">x</Chip>)
    expect(screen.getByText('x')).toHaveClass('bg-indigo-600')

    rerender(<Chip variant="status-published">x</Chip>)
    expect(screen.getByText('x').className).toMatch(/emerald/)

    rerender(<Chip variant="status-draft">x</Chip>)
    expect(screen.getByText('x').className).toMatch(/amber/)

    rerender(<Chip variant="status-rejected">x</Chip>)
    expect(screen.getByText('x').className).toMatch(/rose/)
  })

  it('as a toggle, reflects pressed state in aria-pressed and applies toggled styles', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()

    const { rerender } = render(
      <Chip variant="neutral" toggled={false} onToggle={onToggle}>RX</Chip>,
    )
    const off = screen.getByRole('button', { name: 'RX' })
    expect(off).toHaveAttribute('aria-pressed', 'false')
    expect(off).toHaveClass('bg-gray-800')

    await user.click(off)
    expect(onToggle).toHaveBeenCalledTimes(1)

    rerender(<Chip variant="neutral" toggled onToggle={onToggle}>RX</Chip>)
    const on = screen.getByRole('button', { name: 'RX' })
    expect(on).toHaveAttribute('aria-pressed', 'true')
    expect(on).toHaveClass('bg-gray-200')
  })

  it('fires onDismiss and stops propagation to the toggle handler', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    const onDismiss = vi.fn()

    render(
      <Chip variant="neutral" onToggle={onToggle} onDismiss={onDismiss}>
        Thruster
      </Chip>,
    )

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onToggle).not.toHaveBeenCalled()
  })
})
