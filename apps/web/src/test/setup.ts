import '@testing-library/jest-dom'
import { vi } from 'vitest'

// jsdom doesn't implement IntersectionObserver; provide a no-op stub so
// components that use it (Feed infinite scroll) don't throw during tests.
class MockIntersectionObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  constructor(_cb: IntersectionObserverCallback, _opts?: IntersectionObserverInit) {}
}
Object.defineProperty(globalThis, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: MockIntersectionObserver,
})

// jsdom doesn't implement matchMedia; default to "no match" so the
// useMediaQuery hook takes the wide / desktop branch. Tests that need to
// assert mobile behavior override window.matchMedia per-test.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as MediaQueryList,
  })
}
