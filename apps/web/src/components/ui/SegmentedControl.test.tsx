import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import SegmentedControl from './SegmentedControl'

const OPTIONS = [
  { value: 'one',   label: 'One' },
  { value: 'two',   label: 'Two' },
  { value: 'three', label: 'Three' },
] as const

describe('SegmentedControl', () => {
  it('renders each option as a radio button with its label', () => {
    render(<SegmentedControl options={[...OPTIONS]} value="one" onChange={vi.fn()} />)
    expect(screen.getByRole('radio', { name: 'One' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Two' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Three' })).toBeInTheDocument()
  })

  it('reflects the selected value via aria-checked', () => {
    render(<SegmentedControl options={[...OPTIONS]} value="two" onChange={vi.fn()} />)
    expect(screen.getByRole('radio', { name: 'One' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'Two' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Three' })).toHaveAttribute('aria-checked', 'false')
  })

  it('fires onChange when a segment is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SegmentedControl options={[...OPTIONS]} value="one" onChange={onChange} />)

    await user.click(screen.getByRole('radio', { name: 'Three' }))
    expect(onChange).toHaveBeenCalledWith('three')
  })

  it('navigates with ArrowRight / ArrowLeft and fires onChange for each step', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SegmentedControl options={[...OPTIONS]} value="one" onChange={onChange} />)

    const first = screen.getByRole('radio', { name: 'One' })
    first.focus()

    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('two')

    await user.keyboard('{ArrowLeft}')
    // After ArrowLeft from a freshly-focused 'two' segment, wraps to 'one' (idx 0)
    // Note: handler computes from the rendered focused index, which is now 'two'.
    expect(onChange).toHaveBeenLastCalledWith('one')
  })

  it('wraps from the last segment to the first on ArrowRight', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SegmentedControl options={[...OPTIONS]} value="three" onChange={onChange} />)

    screen.getByRole('radio', { name: 'Three' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('one')
  })

  it('disables every segment and blocks click + keyboard when disabled', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SegmentedControl options={[...OPTIONS]} value="one" onChange={onChange} disabled />)

    const two = screen.getByRole('radio', { name: 'Two' })
    expect(two).toBeDisabled()

    await user.click(two)
    expect(onChange).not.toHaveBeenCalled()

    screen.getByRole('radio', { name: 'One' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('only the selected segment has tabIndex 0; others are -1 (roving tabindex)', () => {
    render(<SegmentedControl options={[...OPTIONS]} value="two" onChange={vi.fn()} />)
    expect(screen.getByRole('radio', { name: 'One' })).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('radio', { name: 'Two' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('radio', { name: 'Three' })).toHaveAttribute('tabindex', '-1')
  })
})
