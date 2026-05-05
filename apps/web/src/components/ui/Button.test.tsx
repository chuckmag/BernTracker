import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import Button from './Button'

describe('Button', () => {
  it('renders each variant with its own style class', () => {
    const { rerender } = render(<Button variant="primary">Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('bg-indigo-600')

    rerender(<Button variant="secondary">Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('bg-slate-200')

    rerender(<Button variant="tertiary">Go</Button>)
    const tertiary = screen.getByRole('button', { name: 'Go' })
    expect(tertiary).toHaveClass('text-slate-500')
    // Tertiary has no default background (only hover:bg-*).
    expect(tertiary.className).not.toMatch(/\bbg-(indigo|rose)-/)
    expect(tertiary.className).not.toMatch(/(?<!hover:)bg-slate-100/)

    rerender(<Button variant="destructive">Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('bg-rose-600')
  })

  it('defaults to primary when variant is omitted', () => {
    render(<Button>Default</Button>)
    expect(screen.getByRole('button', { name: 'Default' })).toHaveClass('bg-indigo-600')
  })

  it('applies disabled styling and blocks clicks when disabled', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button disabled onClick={onClick}>Nope</Button>)

    const btn = screen.getByRole('button', { name: 'Nope' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveClass('disabled:opacity-40')

    await user.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('fires onClick when enabled', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Click</Button>)

    await user.click(screen.getByRole('button', { name: 'Click' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('forwards className so consumers can override width/spacing', () => {
    render(<Button className="w-full">Wide</Button>)
    expect(screen.getByRole('button', { name: 'Wide' })).toHaveClass('w-full')
  })
})
