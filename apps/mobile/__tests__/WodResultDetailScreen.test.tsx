import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import WodResultDetailScreen from '../src/screens/WodResultDetailScreen'

const ENTRY = {
  id: 'result-1',
  user: { id: 'user-2', name: 'Jane Doe', birthday: null },
  level: 'RX' as const,
  workoutGender: 'OPEN' as const,
  value: { type: 'FOR_TIME' as const, seconds: 210 },
  notes: null,
  createdAt: '2026-05-01T10:00:00.000Z',
}

jest.mock('../src/lib/api', () => ({
  api: {
    social: {
      reactions: {
        listForResult: jest.fn().mockResolvedValue([]),
      },
      comments: {
        list: jest.fn().mockResolvedValue({ comments: [], total: 0, page: 1, limit: 20, pages: 1 }),
        create: jest.fn(),
        edit: jest.fn(),
        remove: jest.fn(),
        reply: jest.fn(),
      },
    },
  },
}))

jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', firstName: 'Me', lastName: null, email: 'me@example.com', name: 'Me', identifiedGender: null },
  }),
}))

jest.mock('../src/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      screenBg: '#030712',
      cardBg: '#111827',
      borderSubtle: '#1f2937',
      borderInteractive: '#374151',
      textPrimary: '#ffffff',
      textSecondary: '#d1d5db',
      textTertiary: '#9ca3af',
      textPlaceholder: '#6b7280',
      inputBg: '#1f2937',
      primary: '#5B9BE6',
      accent: '#5FD4D0',
      errorText: '#fb7185',
    },
    isDark: true,
  }),
}))

jest.mock('../src/lib/format', () => ({
  formatResultValue: () => '3:30',
}))

function makeRoute(entry = ENTRY) {
  return { params: { entry, workoutTitle: 'Fran' } } as any
}

describe('WodResultDetailScreen', () => {
  it('renders without crashing and shows athlete name', async () => {
    const { findByText } = render(
      <WodResultDetailScreen route={makeRoute()} navigation={{} as any} />,
    )
    expect(await findByText('Jane Doe')).toBeTruthy()
  })

  it('shows formatted score and level badge', async () => {
    const { findByText } = render(
      <WodResultDetailScreen route={makeRoute()} navigation={{} as any} />,
    )
    expect(await findByText('3:30')).toBeTruthy()
    expect(await findByText('RX')).toBeTruthy()
  })

  it('shows result notes when present', async () => {
    const entryWithNotes = { ...ENTRY, notes: 'Felt strong today' }
    const { findByText } = render(
      <WodResultDetailScreen route={makeRoute(entryWithNotes)} navigation={{} as any} />,
    )
    expect(await findByText('Felt strong today')).toBeTruthy()
  })

  it('renders the comment compose input', async () => {
    const { findByTestId } = render(
      <WodResultDetailScreen route={makeRoute()} navigation={{} as any} />,
    )
    expect(await findByTestId('compose-input')).toBeTruthy()
  })

  it('shows empty comment state when no comments', async () => {
    const { findByText } = render(
      <WodResultDetailScreen route={makeRoute()} navigation={{} as any} />,
    )
    expect(await findByText('No comments yet. Be the first!')).toBeTruthy()
  })
})
