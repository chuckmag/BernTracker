import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '../context/ThemeContext'
import ConsistencyCard from './ConsistencyCard'
import type { ConsistencyData } from '../lib/api'

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>)
}

const data: ConsistencyData = {
  currentStreak: 7,
  longestStreak: 21,
  history: [
    { date: '2026-04-28', count: 1 },
    { date: '2026-04-29', count: 3 },
    { date: '2026-05-01', count: 2 },
  ],
}

describe('ConsistencyCard', () => {
  it('renders the card heading', () => {
    renderWithTheme(<ConsistencyCard data={data} />)
    expect(screen.getByText('Consistency')).toBeInTheDocument()
  })

  it('renders the streak ring with aria-label containing current streak', () => {
    renderWithTheme(<ConsistencyCard data={data} />)
    expect(screen.getByRole('img', { name: /Current streak: 7 days/i })).toBeInTheDocument()
  })

  it('displays the personal best streak', () => {
    renderWithTheme(<ConsistencyCard data={data} />)
    expect(screen.getByText('Best: 21d')).toBeInTheDocument()
  })

  it('renders the heatmap aria-label', () => {
    renderWithTheme(<ConsistencyCard data={data} />)
    expect(screen.getByLabelText('Workout days heatmap')).toBeInTheDocument()
  })

  it('renders day cells for the 16-week window (16 × 7 = 112 cells)', () => {
    renderWithTheme(<ConsistencyCard data={data} />)
    // Each cell has a title attribute with the date — count titled divs
    const heatmap = screen.getByLabelText('Workout days heatmap')
    const cells = heatmap.querySelectorAll('[title]')
    expect(cells.length).toBe(112)
  })

  it('renders "Last 16 weeks" label', () => {
    renderWithTheme(<ConsistencyCard data={data} />)
    expect(screen.getByText('Last 16 weeks')).toBeInTheDocument()
  })
})
