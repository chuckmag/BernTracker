import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ThemeProvider, useTheme } from './ThemeContext'
import { THEME_STORAGE_KEY } from '../lib/useTheme'

// jsdom doesn't implement matchMedia — provide a stub that defaults to light.
const mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}))

// jsdom doesn't implement localStorage — stub it.
const localStorageStore: Record<string, string> = {}
const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
  setItem: vi.fn((key: string, val: string) => { localStorageStore[key] = val }),
  removeItem: vi.fn((key: string) => { delete localStorageStore[key] }),
}

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: mockMatchMedia })
  vi.stubGlobal('localStorage', localStorageMock)
  delete localStorageStore[THEME_STORAGE_KEY]
  document.documentElement.classList.remove('dark')
  vi.clearAllMocks()
  // Re-attach store lookups after clearAllMocks resets the implementations.
  localStorageMock.getItem.mockImplementation((key: string) => localStorageStore[key] ?? null)
  localStorageMock.setItem.mockImplementation((key: string, val: string) => { localStorageStore[key] = val })
  localStorageMock.removeItem.mockImplementation((key: string) => { delete localStorageStore[key] })
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.classList.remove('dark')
})

function ModeDisplay() {
  const { mode, setMode } = useTheme()
  return (
    <>
      <span data-testid="mode">{mode}</span>
      <button onClick={() => setMode('light')}>light</button>
      <button onClick={() => setMode('dark')}>dark</button>
      <button onClick={() => setMode('system')}>system</button>
    </>
  )
}

describe('ThemeProvider', () => {
  it('defaults to system mode when no stored preference', () => {
    render(<ThemeProvider><ModeDisplay /></ThemeProvider>)
    expect(screen.getByTestId('mode')).toHaveTextContent('system')
  })

  it('reads stored preference from localStorage', () => {
    localStorageStore[THEME_STORAGE_KEY] = 'light'
    render(<ThemeProvider><ModeDisplay /></ThemeProvider>)
    expect(screen.getByTestId('mode')).toHaveTextContent('light')
  })

  it('falls back to system for an unrecognised stored value', () => {
    localStorageStore[THEME_STORAGE_KEY] = 'purple'
    render(<ThemeProvider><ModeDisplay /></ThemeProvider>)
    expect(screen.getByTestId('mode')).toHaveTextContent('system')
  })

  it('adds dark class to <html> when mode is set to dark', async () => {
    render(<ThemeProvider><ModeDisplay /></ThemeProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'dark' }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorageStore[THEME_STORAGE_KEY]).toBe('dark')
  })

  it('removes dark class from <html> when mode is set to light', async () => {
    document.documentElement.classList.add('dark')
    render(<ThemeProvider><ModeDisplay /></ThemeProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'light' }))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorageStore[THEME_STORAGE_KEY]).toBe('light')
  })

  it('resolves system to light when prefers-color-scheme is light', async () => {
    mockMatchMedia.mockReturnValue({ matches: false, media: '', addEventListener: vi.fn(), removeEventListener: vi.fn() })
    render(<ThemeProvider><ModeDisplay /></ThemeProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'system' }))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('resolves system to dark when prefers-color-scheme is dark', async () => {
    mockMatchMedia.mockReturnValue({ matches: true, media: '', addEventListener: vi.fn(), removeEventListener: vi.fn() })
    render(<ThemeProvider><ModeDisplay /></ThemeProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'system' }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('throws when useTheme is called outside ThemeProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<ModeDisplay />)).toThrow('useTheme must be used within ThemeProvider')
    spy.mockRestore()
  })
})
