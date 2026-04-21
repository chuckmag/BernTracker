import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ErrorBoundary } from 'react-error-boundary'
import { PageErrorFallback } from './App'

// Suppress the expected console.error from React when a render throws
beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks() })

function Bomb(): never {
  throw new Error('Simulated render crash')
}

describe('PageErrorFallback (error boundary)', () => {
  it('renders the fallback instead of crashing when a child throws', () => {
    render(
      <MemoryRouter>
        <ErrorBoundary FallbackComponent={PageErrorFallback}>
          <Bomb />
        </ErrorBoundary>
      </MemoryRouter>,
    )

    expect(screen.getByText('Something went wrong on this page.')).toBeInTheDocument()
    expect(screen.getByText('Simulated render crash')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to Feed' })).toBeInTheDocument()
  })
})
