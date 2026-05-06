import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useMediaQuery, MOBILE_VIEWPORT_QUERY } from './useMediaQuery'

type Listener = (event: MediaQueryListEvent) => void

function mockMatchMedia(initialMatches: boolean): { setMatches: (m: boolean) => void } {
  let listeners: Listener[] = []
  let matches = initialMatches
  const mqlFor = (query: string): MediaQueryList => ({
    get matches() { return matches },
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: ((_type: string, fn: Listener) => { listeners.push(fn) }) as MediaQueryList['addEventListener'],
    removeEventListener: ((_type: string, fn: Listener) => { listeners = listeners.filter((l) => l !== fn) }) as MediaQueryList['removeEventListener'],
    dispatchEvent: vi.fn(),
  })
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => mqlFor(query)),
  })
  return {
    setMatches(m: boolean) {
      matches = m
      listeners.forEach((l) => l({ matches: m, media: '' } as MediaQueryListEvent))
    },
  }
}

describe('useMediaQuery', () => {
  beforeEach(() => {
    mockMatchMedia(false)
  })

  it('returns the initial match state from window.matchMedia', () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useMediaQuery(MOBILE_VIEWPORT_QUERY))
    expect(result.current).toBe(true)
  })

  it('returns false when matchMedia reports no match', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useMediaQuery(MOBILE_VIEWPORT_QUERY))
    expect(result.current).toBe(false)
  })

  it('updates when the media query changes after mount', () => {
    const { setMatches } = mockMatchMedia(false)
    const { result } = renderHook(() => useMediaQuery(MOBILE_VIEWPORT_QUERY))
    expect(result.current).toBe(false)
    act(() => setMatches(true))
    expect(result.current).toBe(true)
    act(() => setMatches(false))
    expect(result.current).toBe(false)
  })
})
