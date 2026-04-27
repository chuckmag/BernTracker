import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import EmptyState from './EmptyState'

describe('EmptyState', () => {
  it('renders title and body text', () => {
    render(<EmptyState title="Nothing here" body="Try something else." />)
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
    expect(screen.getByText('Try something else.')).toBeInTheDocument()
  })

  it('omits body when not provided', () => {
    render(<EmptyState title="Solo" />)
    expect(screen.getByText('Solo')).toBeInTheDocument()
    expect(screen.queryByRole('paragraph')).not.toBeInTheDocument()
  })

  it('fires CTA onClick when the button is clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <EmptyState
        title="No results"
        body="Log your first."
        cta={{ label: 'Log Result', onClick }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Log Result' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders provided icon', () => {
    render(
      <EmptyState
        icon={<svg data-testid="empty-icon" />}
        title="With icon"
      />,
    )
    expect(screen.getByTestId('empty-icon')).toBeInTheDocument()
  })
})
