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
