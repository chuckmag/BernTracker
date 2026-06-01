import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import MyGymsSection from '../src/components/MyGymsSection'

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}))

jest.mock('../src/lib/api', () => ({
  api: {
    me: {
      gyms: jest.fn(),
    },
  },
}))

jest.mock('../src/lib/theme', () => ({
  __esModule: true,
  useTheme: () => ({
    isDark: true,
    colors: {
      screenBg: '#030712', cardBg: '#111827', inputBg: '#1f2937', surfaceSubtle: '#1f2937',
      borderSubtle: '#1f2937', borderInteractive: '#374151',
      textPrimary: '#ffffff', textSecondary: '#d1d5db', textTertiary: '#9ca3af',
      textMuted: '#6b7280', textLabel: '#9ca3af', textPlaceholder: '#6b7280',
      primary: '#5B9BE6', onPrimary: '#ffffff',
      successText: '#34d399', errorText: '#fb7185',
    },
  }),
}))

import { api } from '../src/lib/api'

const gymFixture = (overrides: Record<string, unknown> = {}) => ({
  id: 'g1',
  name: 'CrossFit Test',
  slug: 'cf-test',
  timezone: 'UTC',
  role: 'MEMBER',
  ...overrides,
})

describe('MyGymsSection', () => {
  beforeEach(() => { jest.clearAllMocks() })

  test('shows empty-state copy when the user has no gyms', async () => {
    ;(api.me.gyms as jest.Mock).mockResolvedValue([])
    const { findByText } = render(<MyGymsSection />)
    await findByText("You're not a member of any gym yet")
  })

  test('renders one row per gym with the role badge', async () => {
    ;(api.me.gyms as jest.Mock).mockResolvedValue([
      gymFixture({ id: 'g1', name: 'CrossFit Test', role: 'MEMBER' }),
      gymFixture({ id: 'g2', name: 'Garage Gym',    role: 'COACH'  }),
    ])
    const { findByText, findByTestId } = render(<MyGymsSection />)
    await findByText('CrossFit Test')
    await findByText('Garage Gym')
    await findByText('Member')
    await findByText('Coach')
    await findByTestId('my-gym-row-g1')
    await findByTestId('my-gym-row-g2')
  })

  test('surfaces API errors instead of crashing', async () => {
    ;(api.me.gyms as jest.Mock).mockRejectedValue(new Error('network down'))
    const { findByText } = render(<MyGymsSection />)
    await waitFor(() => findByText('network down'))
  })
})
